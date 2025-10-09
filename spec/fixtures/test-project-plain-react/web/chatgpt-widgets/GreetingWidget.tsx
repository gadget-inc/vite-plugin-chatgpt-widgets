import { useState } from "react";
import "./styles.css";

export default function GreetingWidget() {
  const [name, setName] = useState("");
  const [greeting, setGreeting] = useState("");

  const handleGreet = () => {
    setGreeting(`Hello, ${name || "World"}!`);
  };

  return (
    <div className="greeting-widget p-8 bg-pink-50 rounded-2xl shadow-lg max-w-md mx-auto border border-pink-200">
      <h1 className="text-4xl font-bold text-pink-900 mb-3">Greeting Widget</h1>
      <p className="text-pink-700 mb-6">A simple greeting widget for testing plain React setup.</p>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          className="flex-1 px-4 py-2 border-2 border-pink-300 rounded-lg focus:outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-200"
        />
        <button
          onClick={handleGreet}
          className="px-6 py-2 bg-pink-600 hover:bg-pink-700 text-white font-semibold rounded-lg shadow-md transition-colors duration-200"
        >
          Greet
        </button>
      </div>
      {greeting && (
        <div className="mt-6 p-4 bg-pink-100 border-2 border-pink-300 rounded-lg text-2xl font-bold text-pink-900 text-center">
          {greeting}
        </div>
      )}
    </div>
  );
}
