import { Canvas } from "./Canvas";
import { Palette } from "./Palette";
import { Toolbar } from "./Toolbar";

export function App() {
  return (
    <div className="arq-app">
      <header className="arq-toolbar" data-testid="toolbar"><Toolbar /></header>
      <aside className="arq-palette" data-testid="palette"><Palette /></aside>
      <main className="arq-main"><Canvas /></main>
      <aside className="arq-inspector" data-testid="inspector" />
    </div>
  );
}
