import React from "react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="root-layout">
      <header className="root-header">
        <h1>Root Layout Header</h1>
      </header>
      <main className="root-content">{children}</main>
      <footer className="root-footer">
        <p>Root Layout Footer</p>
      </footer>
    </div>
  );
}
