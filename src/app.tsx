import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/jetbrains-mono/400.css";

import { Whiteboard } from "./components/Whiteboard/Whiteboard";
import { AppDialog } from "./components/Dialog/AppDialog";
import { Tooltip } from "./components/Tooltip/Tooltip";
import "./app.css";

export const App = () => {
  return (
    <main>
      <Whiteboard />
      <AppDialog />
      <Tooltip />
    </main>
  );
};
