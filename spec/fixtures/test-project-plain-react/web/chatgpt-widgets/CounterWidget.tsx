import React, { useState } from "react";

export default function CounterWidget() {
  const [count, setCount] = useState(0);

  return (
    <div className="counter-widget">
      <h1>Counter Widget</h1>
      <p>A simple counter widget for testing plain React setup.</p>
      <div>
        <button onClick={() => setCount(count - 1)}>-</button>
        <span style={{ margin: "0 1rem", fontSize: "1.5rem" }}>{count}</span>
        <button onClick={() => setCount(count + 1)}>+</button>
      </div>
      <button onClick={() => setCount(0)} style={{ marginTop: "1rem" }}>
        Reset
      </button>
    </div>
  );
}
