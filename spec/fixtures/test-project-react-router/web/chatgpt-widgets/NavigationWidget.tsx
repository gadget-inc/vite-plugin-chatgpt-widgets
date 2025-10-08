import React, { useState } from "react";
import { Link, useNavigate } from "react-router";

export default function NavigationWidget() {
  const [count, setCount] = useState(0);
  const navigate = useNavigate();

  const handleNavigateHome = () => {
    navigate("/");
  };

  return (
    <div className="navigation-widget">
      <h1>Navigation Widget</h1>
      <p>This widget demonstrates React Router integration.</p>
      <div>
        <button onClick={() => setCount(count + 1)}>Count: {count}</button>
      </div>
      <nav>
        <ul>
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>
            <Link to="/about">About</Link>
          </li>
        </ul>
      </nav>
      <button onClick={handleNavigateHome}>Navigate to Home</button>
    </div>
  );
}
