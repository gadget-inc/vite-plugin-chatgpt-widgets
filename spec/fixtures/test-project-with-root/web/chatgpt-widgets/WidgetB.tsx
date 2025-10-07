import React from "react";

export default function WidgetB() {
  const [count, setCount] = React.useState(0);

  return (
    <div className="widget-b">
      <h2>Widget B</h2>
      <p>This widget is also wrapped by the root layout.</p>
      <button onClick={() => setCount(count + 1)}>Count: {count}</button>
    </div>
  );
}
