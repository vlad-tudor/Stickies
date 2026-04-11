/* @refresh reload */
import "./analytics";
import { render } from "solid-js/web";
import { App } from "./app";

render(() => <App />, document.getElementById("app")!);
