import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

// Entry point del bundle Remotion (passato a @remotion/bundler). Compilato da
// esbuild di Remotion, NON dal tsc del server.
registerRoot(RemotionRoot);
