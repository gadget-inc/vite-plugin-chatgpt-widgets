import { useState } from "react";
import "./styles.css";

export default function AnotherWidget() {
  const [count, setCount] = useState(0);

  return (
    <div className="another-widget p-8 bg-green-50 rounded-xl border-2 border-green-300">
      <h2 className="text-2xl font-semibold text-green-800 mb-4">Another Widget</h2>
      <button
        onClick={() => setCount(count + 1)}
        className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg shadow-md transition-colors duration-200"
      >
        Count: {count}
      </button>
    </div>
  );
}
