import { useState } from "react";
import "./styles.css";

export default function CounterWidget() {
  const [count, setCount] = useState(0);

  return (
    <div className="counter-widget p-8 bg-indigo-50 rounded-2xl shadow-lg max-w-md mx-auto">
      <h1 className="text-4xl font-bold text-indigo-900 mb-3">Counter Widget</h1>
      <p className="text-indigo-700 mb-6">A simple counter widget for testing plain React setup.</p>
      <div className="flex items-center justify-center gap-4 mb-6">
        <button
          onClick={() => setCount(count - 1)}
          className="w-12 h-12 bg-indigo-600 hover:bg-indigo-700 text-white text-2xl font-bold rounded-full shadow-md transition-colors duration-200"
        >
          -
        </button>
        <span className="text-4xl font-bold text-indigo-900 min-w-[80px] text-center">{count}</span>
        <button
          onClick={() => setCount(count + 1)}
          className="w-12 h-12 bg-indigo-600 hover:bg-indigo-700 text-white text-2xl font-bold rounded-full shadow-md transition-colors duration-200"
        >
          +
        </button>
      </div>
      <button
        onClick={() => setCount(0)}
        className="w-full py-3 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-lg shadow-md transition-colors duration-200"
      >
        Reset
      </button>
    </div>
  );
}
