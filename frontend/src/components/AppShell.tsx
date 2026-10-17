import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { label: "Town", icon: "◇", to: "/town" },
  { label: "Bank & goals", icon: "$", to: "/dashboard" },
];

export function AppShell() {
  return (
    <div className="app-shell">
      <Outlet />
      <nav className="tab-bar" aria-label="Main navigation">
        {navItems.map((item) => (
          <NavLink
            className={({ isActive }) => `tab-link${isActive ? " active" : ""}`}
            to={item.to}
            key={item.to}
          >
            <span className="tab-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
