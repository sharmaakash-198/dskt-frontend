import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { BuildingsPanel } from '../buildings/BuildingsPanel';
import type { Building } from '../buildings/api';
import { FloorWorkspace } from '../floors/FloorWorkspace';
import { FloorsPanel } from '../floors/FloorsPanel';
import type { Floor } from '../floors/api';
import { archiveSite, createSite, listSites, updateSite, type Site } from './api';

export type SitesPanelProps = {
  canMutate: boolean;
};

type LocationView =
  | { level: 'sites' }
  | { level: 'buildings'; site: Site }
  | { level: 'floors'; site: Site; building: Building }
  | { level: 'floor'; site: Site; building: Building; floor: Floor };

export function SitesPanel({ canMutate }: SitesPanelProps) {
  const [view, setView] = useState<LocationView>({ level: 'sites' });
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [timeZone, setTimeZone] = useState('');
  const [city, setCity] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listSites(api).then((result) => {
      if (cancelled) {
        return;
      }
      setLoading(false);
      if (result.ok) {
        setSites(result.sites);
      } else {
        setUnavailable(true);
        setErrorMessage(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setErrorMessage(null);
    const result = await createSite(api, {
      code,
      name,
      timeZone,
      city: city.trim() ? city.trim() : null,
    });
    setCreating(false);
    if (result.ok) {
      setSites((current) =>
        [...current.filter((site) => site.id !== result.site.id), result.site].sort((a, b) =>
          a.code.localeCompare(b.code),
        ),
      );
      setCode('');
      setName('');
      setTimeZone('');
      setCity('');
    } else {
      setErrorMessage(result.error);
    }
  }

  function replaceSite(site: Site) {
    setSites((current) => current.map((item) => (item.id === site.id ? site : item)));
  }

  if (view.level === 'buildings') {
    return (
      <BuildingsPanel
        site={view.site}
        canMutate={canMutate}
        onBack={() => setView({ level: 'sites' })}
        onOpenBuilding={(building) => setView({ level: 'floors', site: view.site, building })}
      />
    );
  }

  if (view.level === 'floors') {
    return (
      <FloorsPanel
        site={view.site}
        building={view.building}
        canMutate={canMutate}
        onBack={() => setView({ level: 'buildings', site: view.site })}
        onOpenFloor={(floor) =>
          setView({ level: 'floor', site: view.site, building: view.building, floor })
        }
      />
    );
  }

  if (view.level === 'floor') {
    return (
      <FloorWorkspace
        site={view.site}
        building={view.building}
        floor={view.floor}
        canMutate={canMutate}
        onBack={() =>
          setView({ level: 'floors', site: view.site, building: view.building })
        }
      />
    );
  }

  return (
    <section className="sites-panel" aria-label="Sites">
      <h2>Sites</h2>
      {errorMessage && (
        <p role="alert" className="error-alert">
          {errorMessage}
        </p>
      )}
      {canMutate && (
        <form className="sign-in-form" onSubmit={(event) => void handleCreate(event)}>
          <div className="form-group">
            <label htmlFor="site-code">Site code</label>
            <input
              id="site-code"
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="site-name">Site name</label>
            <input
              id="site-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="site-timezone">Time zone</label>
            <input
              id="site-timezone"
              required
              placeholder="Asia/Kolkata"
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="site-city">City</label>
            <input id="site-city" value={city} onChange={(event) => setCity(event.target.value)} />
          </div>
          <button type="submit" disabled={creating}>
            {creating ? 'Creating site...' : 'Create site'}
          </button>
        </form>
      )}
      {loading && <p>Loading sites...</p>}
      {!loading && !unavailable && sites.length === 0 && <p>No active sites.</p>}
      <ul className="site-list">
        {sites.map((site) => (
          <SiteCard
            key={site.id}
            site={site}
            canMutate={canMutate}
            onOpenBuildings={() => setView({ level: 'buildings', site })}
            onUpdated={replaceSite}
            onArchived={(siteId) => setSites((current) => current.filter((item) => item.id !== siteId))}
            onError={setErrorMessage}
          />
        ))}
      </ul>
    </section>
  );
}

function SiteCard({
  site,
  canMutate,
  onOpenBuildings,
  onUpdated,
  onArchived,
  onError,
}: {
  site: Site;
  canMutate: boolean;
  onOpenBuildings: () => void;
  onUpdated: (site: Site) => void;
  onArchived: (siteId: string) => void;
  onError: (message: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(site.name);
  const [timeZone, setTimeZone] = useState(site.timeZone);
  const [city, setCity] = useState(site.address.city ?? '');

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    onError(null);
    const result = await updateSite(api, site.id, {
      name,
      timeZone,
      city: city.trim() ? city.trim() : null,
    });
    if (result.ok) {
      onUpdated(result.site);
      setEditing(false);
    } else {
      onError(result.error);
    }
  }

  async function handleArchive() {
    onError(null);
    const result = await archiveSite(api, site.id);
    if (result.ok) {
      onArchived(site.id);
    } else {
      onError(result.error);
    }
  }

  return (
    <li className="site-card">
      <h3>{site.code}</h3>
      <p>{site.name}</p>
      <p>{site.timeZone}</p>
      {site.address.city && <p>{site.address.city}</p>}
      <div className="site-actions">
        <button type="button" onClick={onOpenBuildings}>
          Open buildings for {site.code}
        </button>
        {canMutate && !editing && (
          <>
            <button type="button" onClick={() => setEditing(true)}>
              Edit {site.code}
            </button>
            <button type="button" onClick={() => void handleArchive()}>
              Archive {site.code}
            </button>
          </>
        )}
      </div>
      {canMutate && editing && (
        <form className="sign-in-form" onSubmit={(event) => void handleSave(event)}>
          <div className="form-group">
            <label htmlFor={`name-${site.id}`}>Site name</label>
            <input
              id={`name-${site.id}`}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor={`tz-${site.id}`}>Time zone</label>
            <input
              id={`tz-${site.id}`}
              required
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor={`city-${site.id}`}>City</label>
            <input
              id={`city-${site.id}`}
              value={city}
              onChange={(event) => setCity(event.target.value)}
            />
          </div>
          <button type="submit">Save {site.code}</button>
        </form>
      )}
    </li>
  );
}
