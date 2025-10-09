import React, { useState } from "react";

export default function GreetingWidget() {
  const [name, setName] = useState("");
  const [greeting, setGreeting] = useState("");

  const handleGreet = () => {
    setGreeting(`Hello, ${name || "World"}!`);
  };

  return (
    <div className="greeting-widget">
      <h1>Greeting Widget</h1>
      <p>A simple greeting widget for testing plain React setup.</p>
      <div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          style={{ padding: "0.5rem", marginRight: "0.5rem" }}
        />
        <button onClick={handleGreet}>Greet</button>
      </div>
      {greeting && <div style={{ marginTop: "1rem", fontSize: "1.5rem", fontWeight: "bold" }}>{greeting}</div>}
    </div>
  );
}
