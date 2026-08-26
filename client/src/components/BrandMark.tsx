const VAHANSYNC_MAINTENANCE_MARK_URL = "https://yieicrulmncikbjxjupv.supabase.co/storage/v1/object/public/vahansync-brand/v1/vahansync-maintenance-readiness-vs.png";

type BrandMarkProps = {
  className?: string;
  decorative?: boolean;
};

export function BrandMark({ className = "", decorative = false }: BrandMarkProps) {
  return (
    <span
      className={`vahan-brand-mark ${className}`.trim()}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": "VahanSync maintenance readiness mark" })}
    >
      <img
        src={VAHANSYNC_MAINTENANCE_MARK_URL}
        alt=""
        decoding="async"
      />
    </span>
  );
}

export { VAHANSYNC_MAINTENANCE_MARK_URL };
