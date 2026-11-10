import { ExternalLinkIcon as ExternalLink } from "../icons";
import { Button, type ButtonProps } from "./Button";

export function ExternalLinkButton({
  href,
  variant = "ghost",
  size = "sm",
  icon = <ExternalLink size={13} aria-hidden="true" />,
  onClick,
  ...props
}: ButtonProps & { href: string }) {
  return (
    <Button
      {...props}
      variant={variant}
      size={size}
      icon={icon}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) window.open(href, "_blank", "noopener,noreferrer");
      }}
    />
  );
}
