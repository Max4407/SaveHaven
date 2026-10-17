import { useEffect, useMemo, useState } from "react";
import bakeryUrl from "../../../Assets/houses-pack/small/bakery/bakery_1_abandoned.png";
import townhouseUrl from "../../../Assets/houses-pack/small/townhouse/townhouse_1_new.png";
import wellUrl from "../../../Assets/houses-pack/small/well/well_1_new.png";
import { TownCanvas } from "./TownCanvas";
import { createTownBridge } from "./townBridge";

const catalogItems = [
  { name: "Mossy bakery", price: 240, level: 1, image: bakeryUrl },
  { name: "Townhouse", price: 320, level: 1, image: townhouseUrl },
  { name: "Village well", price: 180, level: 2, image: wellUrl },
];

function TownPage() {
  const bridge = useMemo(() => createTownBridge(), []);
  const [zoom, setZoom] = useState(90);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => bridge.subscribe("cameraChanged", ({ zoom: nextZoom }) => {
    setZoom(Math.round(nextZoom * 100));
  }), [bridge]);

  return (
    <main className="town-page">
      <TownCanvas bridge={bridge} />

      <button
        className={`sidebar-toggle${isSidebarOpen ? " open" : ""}`}
        type="button"
        aria-controls="town-sidebar"
        aria-expanded={isSidebarOpen}
        aria-label={`${isSidebarOpen ? "Collapse" : "Open"} town sidebar`}
        onClick={() => setIsSidebarOpen((isOpen) => !isOpen)}
      >
        <span aria-hidden="true">{isSidebarOpen ? "›" : "‹"}</span>
      </button>

      <aside
        className={`town-sidebar${isSidebarOpen ? " open" : ""}`}
        id="town-sidebar"
        aria-label="Building catalog"
      >
        <header className="town-sidebar-header">
          <span className="page-mark" aria-hidden="true">S</span>
          <div>
            <p className="eyebrow">Town level 2</p>
            <h1>Riverside Valley</h1>
            <p>Your savings are building something beautiful.</p>
          </div>
        </header>

        <div className="town-resources" aria-label="Town resources">
          <span><i aria-hidden="true">◆</i><strong>640</strong><small>Coins</small></span>
          <span><i aria-hidden="true">✦</i><strong>740</strong><small>XP</small></span>
          <span><i aria-hidden="true">↗</i><strong>3</strong><small>Weeks</small></span>
        </div>

        <div className="sidebar-map-meta">
          <span className="map-status"><i /> Empty valley</span>
          <span><strong>Drag</strong> to explore</span>
          <span><strong>Scroll</strong> to zoom</span>
          <span className="zoom-value">{zoom}%</span>
        </div>

        <div className="catalog-heading">
          <div><p className="eyebrow">Building catalog</p><h2>Build your haven</h2></div>
          <span className="coin-balance"><i aria-hidden="true">◆</i> 640</span>
        </div>
        <p className="catalog-intro">Choose a building to preview it on the map. Your wallet is always verified by the server before purchase.</p>

        <div className="catalog-filters" aria-label="Catalog categories">
          <button className="active" type="button">All</button>
          <button type="button">Homes</button>
          <button type="button">Shops</button>
        </div>

        <div className="catalog-grid">
          {catalogItems.map((item) => (
            <article className="catalog-card" key={item.name}>
              <div className="catalog-art"><img src={item.image} alt="" /></div>
              <div className="catalog-card-copy">
                <span className="level-pill">Level {item.level}</span>
                <h3>{item.name}</h3>
                <p><i aria-hidden="true">◆</i> {item.price}</p>
              </div>
              <button type="button" disabled aria-label={`Preview ${item.name}`}>+</button>
            </article>
          ))}
        </div>

        <div className="catalog-status">
          <div className="catalog-status-heading"><span>Next unlock</span><strong>260 XP to go</strong></div>
          <div className="level-track" aria-label="740 of 1000 experience points"><span style={{ width: "74%" }} /></div>
          <p>Reach level 3 to unlock parks and civic buildings.</p>
        </div>
      </aside>
    </main>
  );
}

export default TownPage;
