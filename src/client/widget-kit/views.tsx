/**
 * Wraps a widget's components as MFE views: decodes their props, and renders
 * them with Chakra set up as the shell has it, in whichever document (the page's,
 * or a picture-in-picture window's) the view is shown in. Colors and fonts are
 * inherited from where the shell embeds them.
 */
import { Text } from "@chakra-ui/react";
import { Either, Schema } from "effect";
import type { ComponentType, JSX } from "react";
import { DocumentStyles } from "../document-styles.tsx";
import { WidgetApisProvider } from "./apis.tsx";
import type { WidgetApis } from "./contract.ts";
import type { View, ViewProps } from "../mfe/register-live.tsx";
import {
  decodeEditorProps,
  decodeFullScreenProps,
  decodeWidgetProps,
  type EditorProps,
  type FullScreenProps,
  type WidgetProps,
} from "./decode.ts";

export type { Draft, EditorProps, FullScreenProps, WidgetProps } from "./decode.ts";

const Problem = (props: { message: string }) => (
  <Text fontSize="sm" color="fg.error">{props.message}</Text>
);

/**
 * Any other view a widget provides, given its props as `decode` makes them
 * (e.g. the assistant's panel in the admin bar).
 */
export const customView = <P,>(
  decode: (props: unknown) => Either.Either<P, string>,
  Component: ComponentType<P>,
): View =>
({ props, document }: ViewProps) => {
  const decoded = decode(props);
  return (
    <DocumentStyles document={document}>
      {Either.isLeft(decoded)
        ? <Problem message={decoded.left} />
        : <Component {...(decoded.right as P & JSX.IntrinsicAttributes)} />}
    </DocumentStyles>
  );
};

const PropsWithApis = Schema.Struct({
  apis: Schema.Record({ key: Schema.String, value: Schema.Object }),
});

/** The widget APIs in a view's props; none if they aren't there. */
const apisOf = (props: unknown): WidgetApis =>
  Either.getOrElse(
    Either.map(Schema.decodeUnknownEither(PropsWithApis)(props), (p) => p.apis),
    () => ({}),
  );

/** A view that gives its component the widget APIs in its props, for `useWidgetApi`. */
const withApis = (Inner: View): View => (viewProps: ViewProps) => (
  <WidgetApisProvider apis={apisOf(viewProps.props)}>
    <Inner {...viewProps} />
  </WidgetApisProvider>
);

/** The view shown in a column, given its config decoded with `schema`. */
export const widgetView = <A, I>(
  schema: Schema.Schema<A, I>,
  Component: ComponentType<WidgetProps<A>>,
): View => withApis(customView((props) => decodeWidgetProps(schema, props), Component));

/**
 * The widget with room to spread out, given its config decoded with `schema`: shown
 * over the page as a modal (or in a picture-in-picture window) when the widget view
 * calls `openFullScreen`. Register it as the "full-screen" view.
 */
export const fullScreenView = <A, I>(
  schema: Schema.Schema<A, I>,
  Component: ComponentType<FullScreenProps<A>>,
): View => withApis(customView((props) => decodeFullScreenProps(schema, props), Component));

/** The settings form shown in the column editor. */
export const editorView = <A, I>(
  schema: Schema.Schema<A, I>,
  Component: ComponentType<EditorProps<A>>,
): View => customView((props) => decodeEditorProps(schema, props), Component);
