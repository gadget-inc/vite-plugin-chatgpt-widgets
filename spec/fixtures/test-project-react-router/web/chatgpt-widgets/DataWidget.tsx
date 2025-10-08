import React from "react";
import { useLocation } from "react-router";

export default function DataWidget() {
  const location = useLocation();

  return (
    <div className="data-widget">
      <h1>Data Widget</h1>
      <p>This widget uses React Router hooks to display location data.</p>
      <div>
        <strong>Current pathname:</strong> {location.pathname}
      </div>
      <div>
        <strong>Current search:</strong> {location.search || "(none)"}
      </div>
      <div>
        <strong>Current hash:</strong> {location.hash || "(none)"}
      </div>
    </div>
  );
}
