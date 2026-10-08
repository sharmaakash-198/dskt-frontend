import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { loadHealthReport, type HealthReport } from './health';

const processLabel: Record<HealthReport['process'], string> = {
  live: 'Live',
  unreachable: 'Not reachable',
};

const databaseLabel: Record<HealthReport['database'], string> = {
  ready: 'Ready',
  not_ready: 'Not ready',
  unknown: 'Not checked',
};

const processDetail: Record<HealthReport['process'], string> = {
  live: 'The API process is serving requests.',
  unreachable: 'The API process did not respond.',
};

const databaseDetail: Record<HealthReport['database'], string> = {
  ready: 'PostgreSQL accepted a readiness check.',
  not_ready: 'PostgreSQL did not accept a readiness check. The API process is still live.',
  unknown: 'Readiness was not checked because the API process is not reachable.',
};

export type ReadinessPageProps = {
  onShowSignIn?: () => void;
};

export function ReadinessPage({ onShowSignIn }: ReadinessPageProps = {}) {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void loadHealthReport(api).then((next) => {
      if (!cancelled) {
        setReport(next);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function refresh() {
    setLoading(true);
    void loadHealthReport(api).then((next) => {
      setReport(next);
      setLoading(false);
    });
  }

  return (
    <main className="page">
      <div className="header-nav">
        <p className="eyebrow">Local spine</p>
        {onShowSignIn && (
          <button type="button" className="link-button" onClick={onShowSignIn}>
            Sign in
          </button>
        )}
      </div>
      <h1>DSKT status</h1>
      <p className="lede">
        Liveness is the API process. Readiness is PostgreSQL. A stopped database leaves the process
        live and the database not ready.
      </p>
      <section className="cards" aria-busy={loading}>
        <article className={report ? `card ${report.process}` : 'card'}>
          <h2>Process</h2>
          <p className="state" role="status">
            {loading || !report ? 'Checking' : processLabel[report.process]}
          </p>
          <p>{report ? processDetail[report.process] : 'Asking the API whether it can serve.'}</p>
        </article>
        <article className={report ? `card ${report.database}` : 'card'}>
          <h2>Database</h2>
          <p className="state" role="status">
            {loading || !report ? 'Checking' : databaseLabel[report.database]}
          </p>
          <p>
            {report ? databaseDetail[report.database] : 'Waiting for the process check to finish.'}
          </p>
        </article>
      </section>
      <button type="button" onClick={() => void refresh()} disabled={loading}>
        {loading ? 'Checking' : 'Check again'}
      </button>
    </main>
  );
}
