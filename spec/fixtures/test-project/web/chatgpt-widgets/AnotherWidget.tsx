import React from "react";

export default function AnotherWidget() {
  const [count, setCount] = React.useState(0);

  return (
    <div className="another-widget">
      <h2>Another Widget</h2>
      <button onClick={() => setCount(count + 1)}>Count: {count}</button>
    </div>
  );
}
