import { Whiteboard } from "./components/Whiteboard/Whiteboard";
import "./app.css";

export const App = () => {
  return (
    <main>
      <Whiteboard />
      <span class="version">v{__APP_VERSION__}</span>
    </main>
  );
};
