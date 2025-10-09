import { useState } from "react";
import { Link, useNavigate } from "react-router";
import "./styles.css";

export default function NavigationWidget() {
  const [count, setCount] = useState(0);
  const navigate = useNavigate();

  const handleNavigateHome = () => {
    void navigate("/");
  };

  return (
    <div className="navigation-widget p-8 bg-teal-50 rounded-2xl shadow-lg max-w-md border-2 border-teal-200">
      <h1 className="text-4xl font-bold text-teal-900 mb-3">Navigation Widget</h1>
      <p className="text-teal-700 mb-6">This widget demonstrates React Router integration.</p>
      <div className="mb-6">
        <button
          onClick={() => setCount(count + 1)}
          className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg shadow-md transition-colors duration-200"
        >
          Count: {count}
        </button>
      </div>
      <nav className="mb-6">
        <ul className="space-y-2">
          <li>
            <Link
              to="/"
              className="block p-3 bg-white hover:bg-teal-100 text-teal-900 font-medium rounded-lg shadow-sm border border-teal-200 transition-colors duration-200"
            >
              🏠 Home
            </Link>
          </li>
          <li>
            <Link
              to="/about"
              className="block p-3 bg-white hover:bg-teal-100 text-teal-900 font-medium rounded-lg shadow-sm border border-teal-200 transition-colors duration-200"
            >
              ℹ️ About
            </Link>
          </li>
        </ul>
      </nav>
      <button
        onClick={handleNavigateHome}
        className="w-full py-3 bg-teal-800 hover:bg-teal-900 text-white font-semibold rounded-lg shadow-md transition-colors duration-200"
      >
        Navigate to Home
      </button>
    </div>
  );
}
