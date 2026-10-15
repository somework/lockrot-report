import { useErrorBoundary } from "preact/hooks";
import type { Model } from "../model/types";
import { App } from "./App";
import { ErrorScreen } from "./ErrorScreen";

/** The page, or the error screen when it throws while it renders: a document the model accepted can
 *  still break a surface, and a blank page would hide that. */
export function RenderGuard({ model }: { model: Model }) {
  const caught: unknown = useErrorBoundary()[0];
  if (caught === undefined) return <App model={model} />;
  const message = caught instanceof Error ? caught.message : "The page threw a value that is not an Error.";
  return <ErrorScreen error={{ kind: "render-failed", message }} />;
}
