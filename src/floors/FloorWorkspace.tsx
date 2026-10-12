import type { Building } from '../buildings/api';
import type { Site } from '../sites/api';
import type { Floor } from './api';

export type FloorWorkspaceProps = {
  site: Site;
  building: Building;
  floor: Floor;
  onBack: () => void;
};

export function FloorWorkspace({ site, building, floor, onBack }: FloorWorkspaceProps) {
  return (
    <section className="empty-workspace" aria-label={`Floor ${floor.code}`}>
      <div className="location-breadcrumb">
        <button type="button" className="link-button" onClick={onBack}>
          Back to floors
        </button>
      </div>
      <h2>
        {site.code} / {building.code} / {floor.code}
      </h2>
      <p>
        {floor.name}. Floor planning tools will appear here. This floor workspace is ready and
        currently empty.
      </p>
    </section>
  );
}
