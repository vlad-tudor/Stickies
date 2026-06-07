import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/jetbrains-mono/400.css";

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
