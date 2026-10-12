import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { Building } from '../buildings/api';
import type { Site } from '../sites/api';
import { archiveFloor, createFloor, listFloors, updateFloor, type Floor } from './api';

export type FloorsPanelProps = {
  site: Site;
  building: Building;
  canMutate: boolean;
  onBack: () => void;
  onOpenFloor: (floor: Floor) => void;
};

export function FloorsPanel({
  site,
  building,
  canMutate,
  onBack,
  onOpenFloor,
}: FloorsPanelProps) {
  const [floors, setFloors] = useState<Floor[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listFloors(api, building.id).then((result) => {
      if (cancelled) {
        return;
      }
      setLoading(false);
      if (result.ok) {
        setFloors(result.floors);
      } else {
        setUnavailable(true);
        setErrorMessage(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [building.id]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setErrorMessage(null);
    const result = await createFloor(api, building.id, { code, name });
    setCreating(false);
    if (result.ok) {
      setFloors((current) =>
        [...current.filter((item) => item.id !== result.floor.id), result.floor].sort((a, b) =>
          a.code.localeCompare(b.code),
        ),
      );
      setCode('');
      setName('');
    } else {
      setErrorMessage(result.error);
    }
  }

  function replaceFloor(floor: Floor) {
    setFloors((current) => current.map((item) => (item.id === floor.id ? floor : item)));
  }

  return (
    <section className="sites-panel" aria-label={`Floors for ${building.code}`}>
      <div className="location-breadcrumb">
        <button type="button" className="link-button" onClick={onBack}>
          Back to buildings
        </button>
      </div>
      <h2>
        Floors · {site.code} / {building.code}
      </h2>
      {errorMessage && (
        <p role="alert" className="error-alert">
          {errorMessage}
        </p>
      )}
      {canMutate && (
        <form className="sign-in-form" onSubmit={(event) => void handleCreate(event)}>
          <div className="form-group">
            <label htmlFor="floor-code">Floor code</label>
            <input
              id="floor-code"
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="floor-name">Floor name</label>
            <input
              id="floor-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <button type="submit" disabled={creating}>
            {creating ? 'Creating floor...' : 'Create floor'}
          </button>
        </form>
      )}
      {loading && <p>Loading floors...</p>}
      {!loading && !unavailable && floors.length === 0 && <p>No active floors.</p>}
      <ul className="site-list">
        {floors.map((floor) => (
          <FloorCard
            key={floor.id}
            floor={floor}
            canMutate={canMutate}
            onOpen={() => onOpenFloor(floor)}
            onUpdated={replaceFloor}
            onArchived={(floorId) =>
              setFloors((current) => current.filter((item) => item.id !== floorId))
            }
            onError={setErrorMessage}
          />
        ))}
      </ul>
    </section>
  );
}

function FloorCard({
  floor,
  canMutate,
  onOpen,
  onUpdated,
  onArchived,
  onError,
}: {
  floor: Floor;
  canMutate: boolean;
  onOpen: () => void;
  onUpdated: (floor: Floor) => void;
  onArchived: (floorId: string) => void;
  onError: (message: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(floor.name);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    onError(null);
    const result = await updateFloor(api, floor.id, { name });
    if (result.ok) {
      onUpdated(result.floor);
      setEditing(false);
    } else {
      onError(result.error);
    }
  }

  async function handleArchive() {
    onError(null);
    const result = await archiveFloor(api, floor.id);
    if (result.ok) {
      onArchived(floor.id);
    } else {
      onError(result.error);
    }
  }

  return (
    <li className="site-card">
      <h3>{floor.code}</h3>
      <p>{floor.name}</p>
      <div className="site-actions">
        <button type="button" onClick={onOpen}>
          Open floor {floor.code}
        </button>
        {canMutate && !editing && (
          <>
            <button type="button" onClick={() => setEditing(true)}>
              Edit {floor.code}
            </button>
            <button type="button" onClick={() => void handleArchive()}>
              Archive {floor.code}
            </button>
          </>
        )}
      </div>
      {canMutate && editing && (
        <form className="sign-in-form" onSubmit={(event) => void handleSave(event)}>
          <div className="form-group">
            <label htmlFor={`floor-name-${floor.id}`}>Floor name</label>
            <input
              id={`floor-name-${floor.id}`}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <button type="submit">Save {floor.code}</button>
        </form>
      )}
    </li>
  );
}
