import React, { useState } from "react";

export default function SimpleWidget() {
  const [count, setCount] = useState(0);

  return (
    <div className="simple-widget">
      <h1>Simple Widget</h1>
      <p>This is a simple widget for testing React Router HMR integration.</p>
      <p>It doesn't use any React Router hooks, so it can render standalone.</p>
      <div>
        <button onClick={() => setCount(count + 1)}>Count: {count}</button>
      </div>
    </div>
  );
}

