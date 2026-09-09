import { Canvas } from "./Canvas";

export function App() {
  return (
    <div className="arq-app">
      <header className="arq-toolbar" data-testid="toolbar" />
      <aside className="arq-palette" data-testid="palette" />
      <main className="arq-main"><Canvas /></main>
      <aside className="arq-inspector" data-testid="inspector" />
    </div>
  );
}
