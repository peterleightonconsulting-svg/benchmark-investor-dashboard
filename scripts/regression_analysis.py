#!/usr/bin/env python3
"""
Multivariate regression: what predicts PROMs change over time?

Runs three models:
  1. OLS: Δ Pain Score ~ baseline + demographics + treatment factors
  2. OLS: Δ Function Score ~ baseline + demographics + treatment factors
  3. Logit: P(improved in both pain AND function) ~ same predictors

Usage:
  pip install pymysql pandas statsmodels numpy
  python3 scripts/regression_analysis.py

DB credentials are read from environment variables (same as the API server).
If running against the production DB, set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME.
"""

import os
import sys
import pymysql
import pandas as pd
import numpy as np
import statsmodels.api as sm

# ── DB connection ────────────────────────────────────────────────────────────

def get_connection():
    host = os.environ.get('DB_HOST', '127.0.0.1')
    port = int(os.environ.get('DB_PORT', 3307))
    ssl = {'ssl': {'check_hostname': False}} if os.environ.get('DB_HOST') else None

    kwargs = dict(
        host=host,
        port=port,
        user=os.environ.get('DB_USER', 'benchmark2026'),
        password=os.environ.get('DB_PASSWORD', 'Benchmark941!!'),
        database=os.environ.get('DB_NAME', 'benchmark-mysql'),
        charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor,
    )
    if ssl:
        kwargs['ssl'] = ssl

    return pymysql.connect(**kwargs)

# ── Fetch raw data ───────────────────────────────────────────────────────────

EXCLUDE = """
    u.is_test_account = 0
    AND u.email NOT LIKE '%@benchmarkps.org'
    AND u.email NOT LIKE 'gus@%'
"""

def fetch_data():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT
                    psf.patient_id, psf.created_at,
                    psf.pain_intensity,
                    psf.activity_one_result,
                    psf.activity_two_result,
                    psf.activity_three_result,
                    p.gender,
                    p.activity_level,
                    bp.name AS body_part
                FROM patient_symptoms_form psf
                JOIN patients p ON psf.patient_id = p.id
                JOIN users u    ON p.doctor_id = u.id
                LEFT JOIN injury i     ON p.id = i.patient_id
                LEFT JOIN body_parts bp ON i.body_part_id = bp.id
                WHERE {EXCLUDE}
                ORDER BY psf.patient_id, psf.created_at ASC
            """)
            proms = cur.fetchall()

            cur.execute(f"""
                SELECT pts.patient_id, COUNT(*) AS n_sessions
                FROM patient_test_sessions pts
                JOIN patients p ON pts.patient_id = p.id
                JOIN users u    ON p.doctor_id = u.id
                WHERE {EXCLUDE}
                GROUP BY pts.patient_id
            """)
            sessions = {r['patient_id']: int(r['n_sessions']) for r in cur.fetchall()}

    finally:
        conn.close()

    return proms, sessions

# ── Build patient-level DataFrame ────────────────────────────────────────────

def mean_activity(row):
    vals = [row[k] for k in ('activity_one_result', 'activity_two_result', 'activity_three_result')
            if row[k] is not None]
    return sum(vals) / len(vals) if vals else None


ACTIVITY_MAP = {
    'meets-both':    'Meets Both Guidelines',
    'meets-one':     'Meets One Guideline',
    'exceeds-both':  'Exceeds Both Guidelines',
    'exceeds-one':   'Exceeds One, Meets Other',
    'Meets both the cardiovascular and resistance training guidelines as suggested by the NHS':             'Meets Both Guidelines',
    'Meets one of the cardiovascular or resistance training guidelines as suggested by the NHS':           'Meets One Guideline',
    'Exceeds both the cardiovascular and resistance training guidelines as suggested by the NHS':          'Exceeds Both Guidelines',
    'Exceeds one of the cardiovascular or resistance training guidelines as suggested by the NHS & meets the other': 'Exceeds One, Meets Other',
    'Does not meet the cardiovascular or resistance training guidelines as suggested by the NHS':          'Does Not Meet Guidelines',
}

BODY_PART_MAP = {
    'lumbar-spine': 'Lumbar Spine',
    'lumbar spine': 'Lumbar Spine',
}

def build_dataframe(proms, sessions):
    by_patient = {}
    for row in proms:
        pid = row['patient_id']
        if pid not in by_patient:
            by_patient[pid] = {
                'records': [],
                'gender': row['gender'],
                'activity_level': row['activity_level'],
                'body_part': row['body_part'],
            }
        by_patient[pid]['records'].append(row)

    rows = []
    for pid, p in by_patient.items():
        recs = p['records']
        if len(recs) < 2:
            continue

        first, last = recs[0], recs[-1]
        days = (pd.Timestamp(last['created_at']) - pd.Timestamp(first['created_at'])).days
        if days < 3:
            continue

        bp = first['pain_intensity']
        lp = last['pain_intensity']
        bf = mean_activity(first)
        lf = mean_activity(last)

        rows.append({
            'patient_id':        pid,
            'delta_pain':        (lp - bp) if bp is not None and lp is not None else np.nan,
            'delta_function':    (lf - bf) if bf is not None and lf is not None else np.nan,
            'baseline_pain':     bp if bp is not None else np.nan,
            'baseline_function': bf if bf is not None else np.nan,
            'gender':            p['gender'] or 'Unknown',
            'activity_level':    ACTIVITY_MAP.get(p['activity_level'] or '', p['activity_level'] or 'Unknown'),
            'body_part':         BODY_PART_MAP.get((p['body_part'] or '').lower(), p['body_part'] or 'Other'),
            'treatment_days':    days,
            'n_sessions':        sessions.get(pid, 0),
            'n_proms':           len(recs),
        })

    return pd.DataFrame(rows)

# ── Helpers ──────────────────────────────────────────────────────────────────

def top_n_body_parts(series, n=4):
    top = series.value_counts().head(n).index.tolist()
    return series.apply(lambda x: x if x in top else 'Other')


def sig_stars(p):
    if p < 0.001: return '***'
    if p < 0.01:  return '**'
    if p < 0.05:  return '*'
    if p < 0.1:   return '.'
    return ''


def print_results(model, label):
    print(f"\n{'=' * 65}")
    print(f"  {label}  (n={int(model.nobs)})")
    print('=' * 65)
    tbl = pd.DataFrame({
        'Coef':    model.params.round(3),
        'Std Err': model.bse.round(3),
        'p':       model.pvalues.round(4),
        '':        model.pvalues.apply(sig_stars),
    })
    print(tbl.to_string())
    try:
        r2 = model.rsquared
        print(f"\nR² = {r2:.3f}  |  Adj. R² = {model.rsquared_adj:.3f}"
              f"  |  F p-value = {model.f_pvalue:.4f}")
    except AttributeError:
        print(f"\nPseudo R² (McFadden) = {model.prsquared:.3f}")
    print("\n  Significance: *** p<0.001  ** p<0.01  * p<0.05  . p<0.1")


def build_X(sub, extra_cols):
    sub = sub.copy()
    sub['body_part'] = top_n_body_parts(sub['body_part'])
    dummies = pd.get_dummies(sub[['gender', 'activity_level', 'body_part']], drop_first=True)
    X = pd.concat([
        sub[extra_cols].reset_index(drop=True),
        dummies.reset_index(drop=True),
    ], axis=1).astype(float)
    return sm.add_constant(X)

# ── Models ───────────────────────────────────────────────────────────────────

def run_ols(df, outcome, baseline_col, label):
    cols = [outcome, baseline_col, 'gender', 'activity_level', 'body_part',
            'treatment_days', 'n_sessions']
    sub = df.dropna(subset=cols)

    if len(sub) < 15:
        print(f"\n⚠  {label}: only {len(sub)} complete cases — need 15+ to fit, skipping.")
        return

    X = build_X(sub, [baseline_col, 'treatment_days', 'n_sessions'])
    y = sub[outcome].reset_index(drop=True)
    model = sm.OLS(y, X).fit()
    print_results(model, f"OLS — {label}")


def run_logit(df):
    cols = ['delta_pain', 'delta_function', 'baseline_pain', 'baseline_function',
            'gender', 'activity_level', 'body_part', 'treatment_days', 'n_sessions']
    sub = df.dropna(subset=cols).copy()
    sub['improved_both'] = ((sub['delta_pain'] > 0) & (sub['delta_function'] > 0)).astype(int)

    n_events = sub['improved_both'].sum()
    if len(sub) < 20 or n_events < 5:
        print(f"\n⚠  Logit: {len(sub)} cases, {n_events} events — insufficient, skipping.")
        return

    X = build_X(sub, ['baseline_pain', 'baseline_function', 'treatment_days', 'n_sessions'])
    y = sub['improved_both'].reset_index(drop=True)
    model = sm.Logit(y, X).fit(disp=0)

    # Augment with odds ratios
    print(f"\n{'=' * 65}")
    print(f"  Logit — Improved in Both Pain + Function  (n={len(sub)}, events={n_events})")
    print('=' * 65)
    tbl = pd.DataFrame({
        'Coef':     model.params.round(3),
        'Odds Ratio': np.exp(model.params).round(3),
        'p':        model.pvalues.round(4),
        '':         model.pvalues.apply(sig_stars),
    })
    print(tbl.to_string())
    print(f"\nPseudo R² (McFadden) = {model.prsquared:.3f}")
    print("\n  Significance: *** p<0.001  ** p<0.01  * p<0.05  . p<0.1")
    print("  Odds Ratio > 1 = predictor increases chance of improving in both metrics")

# ── Main ─────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print("Connecting to database...")
    try:
        proms_raw, sessions_raw = fetch_data()
    except Exception as e:
        print(f"❌  DB connection failed: {e}")
        sys.exit(1)

    df = build_dataframe(proms_raw, sessions_raw)

    print(f"\n✓  Dataset: {len(df)} patients with longitudinal PROMs (≥3 days apart)")
    print(f"   delta_pain available:     {df['delta_pain'].notna().sum()}")
    print(f"   delta_function available: {df['delta_function'].notna().sum()}")
    print(f"\n   Gender breakdown:        {df['gender'].value_counts().to_dict()}")
    print(f"   Activity level breakdown: {df['activity_level'].value_counts().to_dict()}")
    print(f"   Top body parts:          {df['body_part'].value_counts().head(6).to_dict()}")
    print(f"\n   treatment_days — mean: {df['treatment_days'].mean():.1f}, "
          f"median: {df['treatment_days'].median():.1f}")
    print(f"   n_sessions     — mean: {df['n_sessions'].mean():.1f}, "
          f"median: {df['n_sessions'].median():.1f}")

    run_ols(df, 'delta_pain',     'baseline_pain',     'Δ Pain Score')
    run_ols(df, 'delta_function', 'baseline_function', 'Δ Function Score')
    run_logit(df)

    print("\n")
