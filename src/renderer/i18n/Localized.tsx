import { Fragment, type ReactNode } from "react";
import { Trans } from "react-i18next";
import { formatNumber, i18n, type MessageKey } from "@shared/i18n";

export function Localized({
  id,
  values = {},
  count,
}: {
  id: MessageKey;
  values?: Readonly<Record<string, ReactNode>>;
  count?: number;
}) {
  return (
    <Trans
      i18n={i18n}
      i18nKey={id as string}
      {...(count === undefined ? {} : { count })}
      values={count === undefined ? {} : { count: formatNumber(count) }}
      tOptions={{ nest: false }}
      components={Object.fromEntries(
        Object.entries(values).map(([name, value]) => [
          name,
          <Fragment>{typeof value === "number" ? formatNumber(value) : value}</Fragment>,
        ]),
      )}
    />
  );
}
