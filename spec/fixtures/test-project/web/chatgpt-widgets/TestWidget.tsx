import "./styles.css";

export default function TestWidget() {
  return (
    <div className="test-widget p-6 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-xl">
      <h1 className="text-3xl font-bold text-white mb-4">Test Widget</h1>
      <p className="text-white text-lg">This is a test widget component with Tailwind CSS.</p>
    </div>
  );
}
