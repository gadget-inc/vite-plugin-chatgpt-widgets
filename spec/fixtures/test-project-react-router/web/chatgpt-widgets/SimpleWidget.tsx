import { useState } from "react";
import "./styles.css";

export default function SimpleWidget() {
  const [count, setCount] = useState(0);

  return (
    <div className="simple-widget p-8 bg-cyan-50 rounded-2xl shadow-lg max-w-md border-2 border-cyan-200">
      <h1 className="text-4xl font-bold text-cyan-900 mb-3">Simple Widget</h1>
      <p className="text-cyan-700 mb-2">This is a simple widget for testing React Router HMR integration.</p>
      <p className="text-cyan-600 text-sm mb-6">It doesn&apos;t use any React Router hooks, so it can render standalone.</p>
      <div>
        <button
          onClick={() => setCount(count + 1)}
          className="w-full py-4 bg-cyan-600 hover:bg-cyan-700 text-white text-xl font-bold rounded-lg shadow-md transition-colors duration-200"
        >
          Count: {count}
        </button>
      </div>
    </div>
  );
}
