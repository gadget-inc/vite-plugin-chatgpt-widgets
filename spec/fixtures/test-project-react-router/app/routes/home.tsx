import { Link } from "react-router";

export default function Home() {
  return (
    <div>
      <h1>Welcome to React Router v7</h1>
      <nav>
        <Link to="/about">About</Link>
      </nav>
    </div>
  );
}
