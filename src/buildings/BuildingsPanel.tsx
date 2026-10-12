import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { Site } from '../sites/api';
import {
  archiveBuilding,
  createBuilding,
  listBuildings,
  updateBuilding,
  type Building,
} from './api';

export type BuildingsPanelProps = {
  site: Site;
  canMutate: boolean;
  onBack: () => void;
  onOpenBuilding: (building: Building) => void;
};

export function BuildingsPanel({ site, canMutate, onBack, onOpenBuilding }: BuildingsPanelProps) {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listBuildings(api, site.id).then((result) => {
      if (cancelled) {
        return;
      }
      setLoading(false);
      if (result.ok) {
        setBuildings(result.buildings);
      } else {
        setUnavailable(true);
        setErrorMessage(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [site.id]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setErrorMessage(null);
    const result = await createBuilding(api, site.id, { code, name });
    setCreating(false);
    if (result.ok) {
      setBuildings((current) =>
        [...current.filter((item) => item.id !== result.building.id), result.building].sort(
          (a, b) => a.code.localeCompare(b.code),
        ),
      );
      setCode('');
      setName('');
    } else {
      setErrorMessage(result.error);
    }
  }

  function replaceBuilding(building: Building) {
    setBuildings((current) =>
      current.map((item) => (item.id === building.id ? building : item)),
    );
  }

  return (
    <section className="sites-panel" aria-label={`Buildings for ${site.code}`}>
      <div className="location-breadcrumb">
        <button type="button" className="link-button" onClick={onBack}>
          Back to sites
        </button>
      </div>
      <h2>Buildings · {site.code}</h2>
      {errorMessage && (
        <p role="alert" className="error-alert">
          {errorMessage}
        </p>
      )}
      {canMutate && (
        <form className="sign-in-form" onSubmit={(event) => void handleCreate(event)}>
          <div className="form-group">
            <label htmlFor="building-code">Building code</label>
            <input
              id="building-code"
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="building-name">Building name</label>
            <input
              id="building-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <button type="submit" disabled={creating}>
            {creating ? 'Creating building...' : 'Create building'}
          </button>
        </form>
      )}
      {loading && <p>Loading buildings...</p>}
      {!loading && !unavailable && buildings.length === 0 && <p>No active buildings.</p>}
      <ul className="site-list">
        {buildings.map((building) => (
          <BuildingCard
            key={building.id}
            building={building}
            canMutate={canMutate}
            onOpen={() => onOpenBuilding(building)}
            onUpdated={replaceBuilding}
            onArchived={(buildingId) =>
              setBuildings((current) => current.filter((item) => item.id !== buildingId))
            }
            onError={setErrorMessage}
          />
        ))}
      </ul>
    </section>
  );
}

function BuildingCard({
  building,
  canMutate,
  onOpen,
  onUpdated,
  onArchived,
  onError,
}: {
  building: Building;
  canMutate: boolean;
  onOpen: () => void;
  onUpdated: (building: Building) => void;
  onArchived: (buildingId: string) => void;
  onError: (message: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(building.name);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    onError(null);
    const result = await updateBuilding(api, building.id, { name });
    if (result.ok) {
      onUpdated(result.building);
      setEditing(false);
    } else {
      onError(result.error);
    }
  }

  async function handleArchive() {
    onError(null);
    const result = await archiveBuilding(api, building.id);
    if (result.ok) {
      onArchived(building.id);
    } else {
      onError(result.error);
    }
  }

  return (
    <li className="site-card">
      <h3>{building.code}</h3>
      <p>{building.name}</p>
      <div className="site-actions">
        <button type="button" onClick={onOpen}>
          Open floors for {building.code}
        </button>
        {canMutate && !editing && (
          <>
            <button type="button" onClick={() => setEditing(true)}>
              Edit {building.code}
            </button>
            <button type="button" onClick={() => void handleArchive()}>
              Archive {building.code}
            </button>
          </>
        )}
      </div>
      {canMutate && editing && (
        <form className="sign-in-form" onSubmit={(event) => void handleSave(event)}>
          <div className="form-group">
            <label htmlFor={`building-name-${building.id}`}>Building name</label>
            <input
              id={`building-name-${building.id}`}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <button type="submit">Save {building.code}</button>
        </form>
      )}
    </li>
  );
}
