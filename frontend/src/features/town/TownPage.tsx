import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { Link } from "react-router-dom";
import { TownCanvas } from "./TownCanvas";
import { BUILDING_DRAG_TYPE, buildingCatalog, type BuildingId } from "./catalog/buildingCatalog";
import { createTownBridge } from "./townBridge";

function TownPage() {
  const bridge = useMemo(() => createTownBridge(), []);
  const [zoom, setZoom] = useState(90);

  useEffect(() => bridge.subscribe("cameraChanged", ({ zoom: nextZoom }) => {
    setZoom(Math.round(nextZoom * 100));
  }), [bridge]);

  const handleBuildingDragStart = (event: DragEvent<HTMLElement>, buildingId: BuildingId) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(BUILDING_DRAG_TYPE, buildingId);
    event.dataTransfer.setData("text/plain", buildingId);
    bridge.emit("buildingDragStarted", { buildingId });
  };

  return (
    <main className="town-page">
      <TownCanvas bridge={bridge} />

      <aside
        className="town-sidebar"
        id="town-sidebar"
        aria-label="Building catalog"
      >
        <header className="town-sidebar-header">
          <div>
            <h1>Buildings</h1>
            <p>A little village. A growing future.</p>
          </div>
          <Link className="route-arrow" to="/dashboard" aria-label="Open bank and goals">
            <span aria-hidden="true">→</span>
          </Link>
        </header>

        <div className="town-resources" aria-label="Town resources">
          <span><i aria-hidden="true">◆</i><strong>—</strong><small>Coins</small></span>
          <span><i aria-hidden="true">✦</i><strong>—</strong><small>XP</small></span>
          <span><i aria-hidden="true">↗</i><strong>—</strong><small>Weeks</small></span>
        </div>

        <div className="town-catalog-body">
          <div className="sidebar-map-meta">
            <span className="map-status"><i /> Placement ready</span>
            <span><strong>Drag map</strong> to explore</span>
            <span><strong>Scroll</strong> to zoom</span>
            <span className="zoom-value">{zoom}%</span>
          </div>

          <div className="catalog-filters" aria-label="Catalog categories">
            <button className="active" type="button">All</button>
            <button type="button">Homes</button>
            <button type="button">Shops</button>
          </div>

          <div className="catalog-heading">
            <h2>Choose a building</h2>
            <span>{buildingCatalog.length} available</span>
          </div>
          <p className="catalog-intro">Drag a building onto the grass to place it.</p>

          <div className="catalog-grid">
            {buildingCatalog.map((item) => (
              <article
                className="catalog-card"
                draggable
                aria-label={`${item.name} building`}
                key={item.id}
                onDragStart={(event) => handleBuildingDragStart(event, item.id)}
                onDragEnd={() => bridge.emit("buildingDragEnded", {})}
              >
                <div className="catalog-art"><img src={item.imageUrl} alt="" draggable={false} /></div>
                <div className="catalog-card-copy">
                  <span className="level-pill">Level {item.level}</span>
                  <h3>{item.name}</h3>
                  <p><i aria-hidden="true">◆</i> {item.price}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="catalog-status">
            <div className="catalog-status-heading"><span>Game API status</span><strong>Preview mode</strong></div>
            <p>Placed buildings are local previews until the authoritative wallet and inventory APIs are connected.</p>
          </div>
        </div>
      </aside>
    </main>
  );
}

export default TownPage;
