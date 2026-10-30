import { Select, type SelectProps, cx } from "../../components/ui/index";

export function RemoteSelect({ className, ...props }: SelectProps) {
  return <Select {...props} compact className={cx("w-full", className)} />;
}
