import React, { useEffect, useMemo, useState } from "react";

const ZIPBOX_TAX_ID = "0105567128516";
const GOOGLE_SCRIPT_WEBHOOK =
  import.meta.env.VITE_GOOGLE_SCRIPT_WEBHOOK || "";
const LOGO_URL = import.meta.env.VITE_ZIPBOX_LOGO_URL || "";
const DRAFT_KEY = "zipbox_draft_v2";

/**
 * แนะนำให้ใช้ base64 ของลายเซ็นผู้เสนอราคา
 * เช่น VITE_DEFAULT_SELLER_SIGNATURE=data:image/png;base64,....
 */
const DEFAULT_SELLER_SIGNATURE =
  import.meta.env.VITE_DEFAULT_SELLER_SIGNATURE || "";

type PaymentMethod = "transfer" | "cod";
type CustomerType = "individual" | "business" | "company" | "online" | "";

interface Tier {
  q: number;
  p: number;
}

interface CatalogItem {
  code: string;
  name: string;
  dim: string;
  hot: boolean;
  tiers: Tier[];
}

interface FormState {
  ctype: CustomerType;
  name: string;
  phone: string;
  contact: string;
  address: string;
  deliveryDate: string;
  payment: PaymentMethod | "";
  wantTax: boolean;
  taxName: string;
  taxId: string;
  taxBranch: string;
  taxAddr: string;
}

interface SelectedItemRow {
  item: CatalogItem;
  qty: number;
  rate: number;
  amount: number;
}

type StockMap = Record<string, number | null>;
type SelectedQtyMap = Record<string, number>;
type ErrorMap = Record<string, string>;

interface DraftData {
  ctype?: CustomerType;
  name?: string;
  phone?: string;
  contact?: string;
  address?: string;
  deliveryDate?: string;
  payment?: PaymentMethod | "";
}

interface StepDotsProps {
  step: number;
  onStepChange: (step: number) => void;
}

interface SectionCardProps {
  title: string;
  children: React.ReactNode;
  tone?: "green" | "amber";
  toggle?: () => void;
  open?: boolean;
}

interface FieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}

interface ProductRowProps {
  item: CatalogItem;
  remain: number | null | undefined;
  selectedQty: number;
  onChange: (qty: number) => void;
}

interface SummaryTableProps {
  rows: SelectedItemRow[];
  type?: "quote" | "tax";
}

interface SignaturePadProps {
  label?: string;
  value?: string;
  onChange?: (dataUrl: string) => void;
  height?: number;
}

const CATALOG: CatalogItem[] = [
  {
    code: "STO-OO",
    name: "OO",
    dim: "9.7×14×6 ซม.",
    hot: false,
    tiers: [
      { q: 1, p: 5 },
      { q: 100, p: 4.7 },
      { q: 1000, p: 4.2 },
      { q: 5000, p: 2.8 },
    ],
  },
  {
    code: "STO-O",
    name: "O",
    dim: "11×17×6 ซม.",
    hot: false,
    tiers: [
      { q: 1, p: 5 },
      { q: 100, p: 4.9 },
      { q: 1000, p: 4.6 },
      { q: 5000, p: 3.2 },
    ],
  },
  {
    code: "STO-O4",
    name: "O+4",
    dim: "11×17×10 ซม.",
    hot: false,
    tiers: [
      { q: 1, p: 6 },
      { q: 100, p: 5.8 },
      { q: 1000, p: 4.8 },
      { q: 5000, p: 3.9 },
    ],
  },
  {
    code: "STO-A",
    name: "A",
    dim: "14×20×6 ซม.",
    hot: true,
    tiers: [
      { q: 1, p: 6 },
      { q: 100, p: 5.4 },
      { q: 1000, p: 4.4 },
      { q: 5000, p: 3.5 },
    ],
  },
  {
    code: "STO-AA",
    name: "AA",
    dim: "13×17×7 ซม.",
    hot: true,
    tiers: [
      { q: 1, p: 6 },
      { q: 100, p: 5.8 },
      { q: 1000, p: 4.8 },
      { q: 5000, p: 3.9 },
    ],
  },
  {
    code: "STO-2A",
    name: "2A",
    dim: "14×20×12 ซม.",
    hot: false,
    tiers: [
      { q: 1, p: 8 },
      { q: 100, p: 7 },
      { q: 1000, p: 5.9 },
      { q: 5000, p: 5 },
    ],
  },
  {
    code: "STO-B",
    name: "B",
    dim: "17×25×9 ซม.",
    hot: false,
    tiers: [
      { q: 1, p: 12 },
      { q: 100, p: 7 },
      { q: 1000, p: 5.4 },
      { q: 5000, p: 4.5 },
    ],
  },
  {
    code: "STO-C",
    name: "C",
    dim: "20×30×11 ซม.",
    hot: false,
    tiers: [
      { q: 1, p: 15 },
      { q: 100, p: 9 },
      { q: 1000, p: 7.9 },
      { q: 5000, p: 7 },
    ],
  },
];

const PAYMENT_LABELS: Record<Exclude<PaymentMethod, "">, string> = {
  transfer: "โอนเงินธนาคาร",
  cod: "เก็บเงินปลายทาง (COD)",
};

const CUSTOMER_TYPE_LABELS: Record<Exclude<CustomerType, "">, string> = {
  individual: "บุคคลทั่วไป",
  business: "ร้านค้า / ธุรกิจ",
  company: "บริษัท / นิติบุคคล",
  online: "ร้านค้าออนไลน์",
};

const fmt = (n: number | string) =>
  Number(n || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtInt = (n: number | string) => Number(n || 0).toLocaleString("th-TH");

const fmtRate = (n: number) =>
  Number(n) % 1 === 0 ? String(n) : Number(n).toFixed(2);

function thaiDate(input: string | Date): string {
  if (!input) return "—";
  const d = input instanceof Date ? input : new Date(input);
  return d.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getPPU(item: CatalogItem, qty: number): number {
  let price = item.tiers[0].p;
  for (const tier of item.tiers) {
    if (qty >= tier.q) price = tier.p;
  }
  return price;
}

function genLocalNum(prefix: string): string {
  const year = new Date().getFullYear();
  const num = String(Math.floor(Math.random() * 90000) + 10000);
  return `${prefix}-${year}-${num}`;
}

function numberToThaiWords(n: number): string {
  const integerPart = Math.floor(Number(n) || 0);
  if (integerPart === 0) return "ศูนย์บาทถ้วน";

  const txtNumArr = [
    "",
    "หนึ่ง",
    "สอง",
    "สาม",
    "สี่",
    "ห้า",
    "หก",
    "เจ็ด",
    "แปด",
    "เก้า",
  ];
  const txtDigitArr = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];

  let bahtText = "";
  let numStr = integerPart.toString();

  while (numStr.length > 0) {
    const segment = numStr.slice(-6);
    numStr = numStr.slice(0, -6);

    let segmentText = "";
    for (let i = 0; i < segment.length; i++) {
      const digit = parseInt(segment[i], 10);
      if (digit === 0) continue;

      const pos = segment.length - i - 1;

      if (pos === 0 && digit === 1 && segment.length > 1) {
        segmentText += "เอ็ด";
      } else if (pos === 1 && digit === 1) {
        segmentText += "สิบ";
      } else if (pos === 1 && digit === 2) {
        segmentText += "ยี่สิบ";
      } else {
        segmentText += txtNumArr[digit] + txtDigitArr[pos];
      }
    }

    if (bahtText) {
      bahtText = `${segmentText}ล้าน${bahtText}`;
    } else {
      bahtText = segmentText;
    }
  }

  return `${bahtText}บาทถ้วน`;
}

function getTomorrowIsoDate(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}

function cls(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function SectionCard({
  title,
  children,
  tone = "green",
  toggle,
  open,
}: SectionCardProps) {
  const headerTone =
    tone === "amber"
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : "bg-green-50 text-green-700 border-zinc-200";

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div
        className={cls(
          "border-b px-4 py-3 text-xs font-bold uppercase tracking-wide",
          headerTone,
          toggle && "flex cursor-pointer items-center justify-between"
        )}
        onClick={toggle}
      >
        <span>{title}</span>
        {typeof open === "boolean" ? (
          <span className="text-lg leading-none">{open ? "−" : "+"}</span>
        ) : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Field({ label, required, error, hint, children }: FieldProps) {
  return (
    <div className="border-b border-zinc-200 px-4 py-3 last:border-b-0">
      <label className="mb-1.5 block text-sm font-semibold text-zinc-600">
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-zinc-400">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs text-red-500">{error}</p> : null}
    </div>
  );
}

function TextInput(
  props: React.InputHTMLAttributes<HTMLInputElement>
): React.JSX.Element {
  return (
    <input
      {...props}
      className={cls(
        "w-full rounded-xl border px-3 py-2.5 text-[15px] outline-none transition",
        "border-zinc-300 bg-white focus:border-green-500 focus:ring-4 focus:ring-green-100",
        props.className
      )}
    />
  );
}

function SelectInput(
  props: React.SelectHTMLAttributes<HTMLSelectElement>
): React.JSX.Element {
  return (
    <select
      {...props}
      className={cls(
        "w-full rounded-xl border px-3 py-2.5 text-[15px] outline-none transition",
        "border-zinc-300 bg-white focus:border-green-500 focus:ring-4 focus:ring-green-100",
        props.className
      )}
    />
  );
}

function TextareaInput(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>
): React.JSX.Element {
  return (
    <textarea
      {...props}
      className={cls(
        "min-h-[88px] w-full rounded-xl border px-3 py-2.5 text-[15px] outline-none transition",
        "border-zinc-300 bg-white leading-7 focus:border-green-500 focus:ring-4 focus:ring-green-100",
        props.className
      )}
    />
  );
}

function StepDots({ step, onStepChange }: StepDotsProps) {
  const items = ["ข้อมูลลูกค้า", "เลือกสินค้า", "รายละเอียด", "ใบเสนอราคา"];

  return (
    <div className="sticky top-14 z-30 border-b border-zinc-200 bg-white px-4 py-3 print:hidden">
      <div className="mx-auto grid max-w-2xl grid-cols-4 gap-2">
        {items.map((label, index) => {
          const current = index + 1;
          const done = current < step;
          const active = current === step;

          return (
            <button
              key={label}
              type="button"
              onClick={() => current < step && onStepChange(current)}
              className="group flex flex-col items-center gap-1"
            >
              <div
                className={cls(
                  "flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-bold transition",
                  done || active
                    ? "border-green-500 bg-green-500 text-white"
                    : "border-zinc-300 bg-zinc-100 text-zinc-400"
                )}
              >
                {done ? "✓" : current}
              </div>
              <span
                className={cls(
                  "text-[10px] whitespace-nowrap",
                  active || done
                    ? "font-semibold text-green-600"
                    : "text-zinc-400"
                )}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProductRow({
  item,
  remain,
  selectedQty,
  onChange,
}: ProductRowProps) {
  const picked = selectedQty > 0;
  const outOfStock = remain !== null && remain !== undefined && remain <= 0;
  const lowStock =
    remain !== null && remain !== undefined && remain > 0 && remain <= 200;

  return (
    <div
      className={cls(
        "flex items-center border-b border-zinc-200 transition last:border-b-0",
        picked ? "bg-green-50" : "bg-white hover:bg-green-50/60",
        outOfStock && "pointer-events-none opacity-50"
      )}
    >
      <div className="px-4 py-3">
        <input
          type="checkbox"
          checked={picked}
          onChange={(e) =>
            onChange(e.target.checked ? Math.max(1, selectedQty || 1) : 0)
          }
          className="h-5 w-5 accent-green-500"
        />
      </div>

      <div className="flex-1 px-1 py-3">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-zinc-900">{item.name}</span>
          {item.hot ? (
            <span className="rounded bg-green-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
              HOT
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 text-xs text-zinc-400">{item.dim}</div>
        <div className="mt-0.5 text-xs font-semibold text-green-700">
          {item.tiers[0].p} ฿/ใบ (ราคาปกติ)
        </div>

        {remain === null || remain === undefined ? (
          <div className="mt-0.5 text-xs text-zinc-400">— ไม่ได้เชื่อม stock realtime</div>
        ) : outOfStock ? (
          <div className="mt-0.5 text-xs text-red-500">❌ หมดสต็อก</div>
        ) : lowStock ? (
          <div className="mt-0.5 text-xs text-amber-500">
            ⚠️ เหลือ {fmtInt(remain)} ใบ
          </div>
        ) : (
          <div className="mt-0.5 text-xs text-zinc-400">
            ✅ มี {fmtInt(remain)} ใบ
          </div>
        )}
      </div>

      <div className="w-28 px-3 py-3">
        <div
          className={cls(
            "transition",
            picked ? "visible opacity-100" : "invisible opacity-0"
          )}
        >
          <div className="mb-1 text-[10px] font-semibold text-zinc-400">
            จำนวน (ใบ)
          </div>
          <input
            type="number"
            min={1}
            value={picked ? selectedQty : ""}
            onChange={(e) => onChange(Math.max(0, Number(e.target.value || 0)))}
            className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-center text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
          />
        </div>
      </div>
    </div>
  );
}

function SummaryTable({ rows, type = "quote" }: SummaryTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-green-50 text-green-700">
            {type === "quote" ? (
              <>
                <th className="border border-zinc-200 px-3 py-2 text-center text-[11px] font-bold">
                  ลำดับ
                </th>
                <th className="border border-zinc-200 px-3 py-2 text-left text-[11px] font-bold">
                  รหัส
                </th>
                <th className="border border-zinc-200 px-3 py-2 text-left text-[11px] font-bold">
                  รายการ
                </th>
                <th className="border border-zinc-200 px-3 py-2 text-center text-[11px] font-bold">
                  ปริมาณ
                </th>
                <th className="border border-zinc-200 px-3 py-2 text-center text-[11px] font-bold">
                  Rate
                </th>
                <th className="border border-zinc-200 px-3 py-2 text-center text-[11px] font-bold">
                  Amount
                </th>
              </>
            ) : (
              <>
                <th className="border border-zinc-200 px-3 py-2 text-center text-[11px] font-bold">
                  ลำดับ
                </th>
                <th className="border border-zinc-200 px-3 py-2 text-left text-[11px] font-bold">
                  รายการสินค้า
                </th>
                <th className="border border-zinc-200 px-3 py-2 text-center text-[11px] font-bold">
                  จำนวน
                </th>
                <th className="border border-zinc-200 px-3 py-2 text-center text-[11px] font-bold">
                  ราคา/ใบ
                </th>
                <th className="border border-zinc-200 px-3 py-2 text-center text-[11px] font-bold">
                  ราคารวม
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${row.item.code}-${idx}`} className="even:bg-zinc-50">
              <td className="border border-zinc-200 px-3 py-2 text-center">
                {idx + 1}
              </td>
              {type === "quote" ? (
                <>
                  <td className="border border-zinc-200 px-3 py-2 text-left text-xs text-zinc-400">
                    {row.item.code}
                  </td>
                  <td className="border border-zinc-200 px-3 py-2 text-left">
                    กล่องหูช้าง เบอร์ {row.item.name} ({row.item.dim})
                  </td>
                  <td className="border border-zinc-200 px-3 py-2 text-center">
                    {fmtInt(row.qty)} ใบ
                  </td>
                  <td className="border border-zinc-200 px-3 py-2 text-center">
                    {fmtRate(row.rate)}
                  </td>
                  <td className="border border-zinc-200 px-3 py-2 text-center">
                    {fmt(row.amount)}
                  </td>
                </>
              ) : (
                <>
                  <td className="border border-zinc-200 px-3 py-2 text-left">
                    กล่องหูช้าง เบอร์ {row.item.name} ({row.item.dim})
                  </td>
                  <td className="border border-zinc-200 px-3 py-2 text-center">
                    {fmtInt(row.qty)} ใบ
                  </td>
                  <td className="border border-zinc-200 px-3 py-2 text-center">
                    {fmtRate(row.rate)} ฿
                  </td>
                  <td className="border border-zinc-200 px-3 py-2 text-center">
                    {fmt(row.amount)} ฿
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SignaturePad({
  label = "ลายเซ็น",
  value,
  onChange,
  height = 160,
}: SignaturePadProps): React.JSX.Element {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const drawingRef = React.useRef<boolean>(false);
  const lastPointRef = React.useRef<{ x: number; y: number } | null>(null);

  const resizeCanvas = React.useCallback(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = wrapper.getBoundingClientRect();
    const savedValue = value || "";

    canvas.width = Math.max(1, rect.width * ratio);
    canvas.height = Math.max(1, height * ratio);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "#18181b";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, height);

    if (savedValue) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, height);
      };
      img.src = savedValue;
    }
  }, [height, value]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  const getPoint = (e: PointerEvent | React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = getPoint(e);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const current = getPoint(e);
    const last = lastPointRef.current;

    if (!last) {
      lastPointRef.current = current;
      return;
    }

    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();

    lastPointRef.current = current;
  };

  const endDrawing = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;

    const canvas = canvasRef.current;
    if (!canvas || !onChange) return;
    onChange(canvas.toDataURL("image/png"));
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (onChange) onChange("");
  };

  return (
    <div className="space-y-2 print:space-y-1">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div className="text-sm font-semibold text-zinc-700">{label}</div>
        <button
          type="button"
          onClick={clearSignature}
          className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-600 hover:border-red-400 hover:text-red-500"
        >
          ล้างลายเซ็น
        </button>
      </div>

      <div
        ref={wrapperRef}
        className="overflow-hidden rounded-2xl border border-dashed border-zinc-300 bg-white print:rounded-none"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={endDrawing}
          onPointerLeave={endDrawing}
          onPointerCancel={endDrawing}
          className="block w-full touch-none cursor-crosshair bg-white print:cursor-default"
        />
      </div>

      <div className="text-xs text-zinc-400 print:hidden">
        ใช้เมาส์หรือนิ้วลากเพื่อเซ็นชื่อ
      </div>
    </div>
  );
}

interface SellerSignatureBlockProps {
  signature: string;
  showImage: boolean;
  name?: string;
}

function SellerSignatureBlock({
  signature,
  showImage,
  name = "Zipbox",
}: SellerSignatureBlockProps): React.JSX.Element {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 print:rounded-none">
      <div className="mb-2 text-sm font-semibold text-zinc-700">
        ลายเซ็นผู้เสนอราคา / Sales Signature
      </div>

      <div className="flex h-[160px] items-center justify-center overflow-hidden rounded-2xl border border-dashed border-zinc-300 bg-white print:rounded-none">
        {showImage && signature ? (
          <img
            src={signature}
            alt="Seller signature"
            className="max-h-full max-w-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="px-4 text-center text-xs leading-6 text-zinc-400 print:hidden">
            ลายเซ็นผู้เสนอราคาจะถูกฝังเฉพาะตอน Export PDF
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-zinc-300 pt-2 text-center text-sm text-zinc-500">
        ({name})
      </div>
    </div>
  );
}

function PrintStyles(): React.JSX.Element {
  return (
    <style>{`
      @page {
        size: A4;
        margin: 10mm;
      }

      @media print {
        html, body {
          background: #fff !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        body * {
          visibility: hidden;
        }

        .print-area, .print-area * {
          visibility: visible;
        }

        .print-area {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #fff !important;
        }

        .print-hide {
          display: none !important;
        }

        .print-show {
          display: block !important;
        }

        .print-avoid-break {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .print-table thead {
          display: table-header-group;
        }

        .print-table tr,
        .print-table td,
        .print-table th {
          break-inside: avoid;
          page-break-inside: avoid;
        }
      }
    `}</style>
  );
}

export default function ZipboxQuotationPage(): React.JSX.Element {
  const [step, setStep] = useState<number>(1);
  const [activeDoc, setActiveDoc] = useState<"quote" | "tax">("quote");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);
  const [stockMap] = useState<StockMap>({});
  const [quoteNum, setQuoteNum] = useState<string>("");
  const [taxNum, setTaxNum] = useState<string>("");
  const [showDraftBanner, setShowDraftBanner] = useState<boolean>(false);
  const [showTaxFields, setShowTaxFields] = useState<boolean>(false);
  const [showSuccess, setShowSuccess] = useState<boolean>(false);

  const [quoteCustomerSignature, setQuoteCustomerSignature] = useState<string>("");
  const [taxReceiverSignature, setTaxReceiverSignature] = useState<string>("");
  const [quoteSellerSignature] = useState<string>(DEFAULT_SELLER_SIGNATURE);

  const [form, setForm] = useState<FormState>({
    ctype: "",
    name: "",
    phone: "",
    contact: "",
    address: "",
    deliveryDate: "",
    payment: "",
    wantTax: false,
    taxName: "",
    taxId: "",
    taxBranch: "",
    taxAddr: "",
  });

  const [selectedQtyMap, setSelectedQtyMap] = useState<SelectedQtyMap>({});
  const [errors, setErrors] = useState<ErrorMap>({});

  useEffect(() => {
    try {
      const draft = JSON.parse(
        localStorage.getItem(DRAFT_KEY) || "{}"
      ) as DraftData;

      if (draft?.name) {
        setForm((prev) => ({
          ...prev,
          ctype: draft.ctype || "",
          name: draft.name || "",
          phone: draft.phone || "",
          contact: draft.contact || "",
          address: draft.address || "",
          deliveryDate: draft.deliveryDate || "",
          payment: draft.payment || "",
        }));
        setShowDraftBanner(true);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    setForm((prev) => ({ ...prev, wantTax: showTaxFields }));
  }, [showTaxFields]);

  const selectedItems = useMemo<SelectedItemRow[]>(() => {
    return CATALOG.map((item) => ({
      item,
      qty: Number(selectedQtyMap[item.code] || 0),
    }))
      .filter((entry) => entry.qty > 0)
      .map((entry) => {
        const rate = getPPU(entry.item, entry.qty);
        return {
          ...entry,
          rate,
          amount: rate * entry.qty,
        };
      });
  }, [selectedQtyMap]);

  const totals = useMemo(() => {
    const subtotal = selectedItems.reduce((sum, item) => sum + item.amount, 0);
    const vat = subtotal * 0.07;
    const total = subtotal + vat;
    const totalQty = selectedItems.reduce((sum, item) => sum + item.qty, 0);
    return { subtotal, vat, total, totalQty };
  }, [selectedItems]);

  function getDocNums(): { quoteNum: string; taxNum: string } {
    const localQuote = quoteNum || genLocalNum("SAL-QTN");
    const localTax = taxNum || genLocalNum("TAX");

    setQuoteNum(localQuote);
    setTaxNum(localTax);

    return { quoteNum: localQuote, taxNum: localTax };
  }

  function saveDraft(): void {
    const draft: DraftData = {
      ctype: form.ctype,
      name: form.name,
      phone: form.phone,
      contact: form.contact,
      address: form.address,
      deliveryDate: form.deliveryDate,
      payment: form.payment,
    };

    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }

  function clearDraft(): void {
    localStorage.removeItem(DRAFT_KEY);
    setShowDraftBanner(false);
    setForm((prev) => ({
      ...prev,
      ctype: "",
      name: "",
      phone: "",
      contact: "",
    }));
  }

  function validateStep1(): void {
    const nextErrors: ErrorMap = {};

    if (!form.ctype) nextErrors.ctype = "กรุณาเลือกประเภทลูกค้า";
    if (!form.name.trim()) nextErrors.name = "กรุณากรอกชื่อ";
    if (!/^0[0-9]{8,9}$/.test(form.phone.trim())) {
      nextErrors.phone = "กรุณากรอกเบอร์โทร (0XXXXXXXXX)";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    saveDraft();
    setStep(2);
  }

  function validateStep2(): void {
    const nextErrors: ErrorMap = {};

    if (selectedItems.length === 0) {
      nextErrors.items = "กรุณาเลือกสินค้าและใส่จำนวนอย่างน้อย 1 รายการ";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setStep(3);
  }

  function validateStep3(): void {
    const nextErrors: ErrorMap = {};

    if (!form.address.trim()) nextErrors.address = "กรุณากรอกที่อยู่จัดส่ง";
    if (!form.deliveryDate) nextErrors.deliveryDate = "กรุณาเลือกวันที่ต้องการรับสินค้า";
    if (!form.payment) nextErrors.payment = "กรุณาเลือกวิธีชำระเงิน";

    if (showTaxFields) {
      if (!form.taxName.trim()) nextErrors.taxName = "กรุณากรอกชื่อ";
      if (!/^[0-9]{13}$/.test(form.taxId.trim())) {
        nextErrors.taxId = "กรุณากรอกเลขผู้เสียภาษี 13 หลัก";
      }
      if (!form.taxAddr.trim()) nextErrors.taxAddr = "กรุณากรอกที่อยู่";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    saveDraft();
    getDocNums();
    setStep(4);
    setActiveDoc("quote");
  }

  async function submitQuote(): Promise<void> {
    setSubmitting(true);

    try {
      if (!GOOGLE_SCRIPT_WEBHOOK) {
        throw new Error("Missing VITE_GOOGLE_SCRIPT_WEBHOOK");
      }

      const docNums = getDocNums();

      const payload = {
        quoteNum: docNums.quoteNum,
        taxNum: docNums.taxNum,
        customerName: form.name,
        customerPhone: form.phone,
        customerContact: form.contact,
        customerType:
          form.ctype && CUSTOMER_TYPE_LABELS[form.ctype]
            ? CUSTOMER_TYPE_LABELS[form.ctype]
            : form.ctype,
        address: form.address,
        deliveryDate: form.deliveryDate,
        paymentMethod:
          form.payment && PAYMENT_LABELS[form.payment]
            ? PAYMENT_LABELS[form.payment]
            : form.payment,
        items: selectedItems.map((row) => ({
          size: row.item.name,
          dim: row.item.dim,
          code: row.item.code,
          qty: row.qty,
          rate: row.rate,
          amount: row.amount,
        })),
        subtotal: totals.subtotal,
        vat: totals.vat,
        total: totals.total,
        wantTaxInvoice: showTaxFields,
        taxName: form.taxName,
        taxId: form.taxId,
        taxBranch: form.taxBranch || "สำนักงานใหญ่",
        taxAddr: form.taxAddr,
        quoteCustomerSignature,
        quoteSellerSignature,
        taxReceiverSignature,
        submittedAt: new Date().toISOString(),
      };

      const res = await fetch(GOOGLE_SCRIPT_WEBHOOK, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const text = await res.text();

      let result: { ok?: boolean; error?: string } = {};
      try {
        result = JSON.parse(text);
      } catch {
        // ignore
      }

      if (!res.ok || result.ok === false) {
        throw new Error(result.error || "submit failed");
      }

      localStorage.removeItem(DRAFT_KEY);
      setShowSuccess(true);
    } catch (error) {
      console.error("Submit failed:", error);
      alert("ส่งข้อมูลไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  async function exportQuotePdf(): Promise<void> {
    try {
      setExportingPdf(true);
      setActiveDoc("quote");

      if (!quoteNum) {
        getDocNums();
      }

      await new Promise((resolve) => setTimeout(resolve, 300));

      window.print();
    } catch (error) {
      console.error("PDF export failed:", error);
      alert("ไม่สามารถ export PDF ได้");
    } finally {
      setTimeout(() => setExportingPdf(false), 500);
    }
  }

  const stockWarning = useMemo<string>(() => {
    for (const row of selectedItems) {
      const remain = stockMap[row.item.name];
      if (remain !== null && remain !== undefined && row.qty > remain) {
        return `⚠️ เบอร์ ${row.item.name} สต็อกเหลือ ${fmtInt(
          remain
        )} ใบ แต่สั่ง ${fmtInt(row.qty)} ใบ — ทีมงานจะติดต่อยืนยันอีกครั้ง`;
      }
    }
    return "";
  }, [selectedItems, stockMap]);

  const now = new Date();
  const expDate = new Date();
  expDate.setDate(expDate.getDate() + 30);

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <PrintStyles />

      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 bg-green-500 px-4 text-white shadow print:hidden">
        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-white/10">
          {LOGO_URL ? (
            <img src={LOGO_URL} alt="ZIPBOX" className="h-9 w-9 object-contain" />
          ) : (
            <span className="text-sm font-bold">Z</span>
          )}
        </div>
        <div>
          <h1 className="text-sm font-bold">ZIPBOX</h1>
          <p className="text-[11px] text-white/80">ขอใบเสนอราคากล่องหูช้าง</p>
        </div>
      </header>

      {step < 4 ? <StepDots step={step} onStepChange={setStep} /> : null}

      <main className="mx-auto max-w-2xl px-3 py-4 sm:px-4">
        {step === 1 ? (
          <div className="space-y-4 print:hidden">
            {showDraftBanner ? (
              <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <span>📝 มีข้อมูลที่กรอกค้างไว้</span>
                <button onClick={clearDraft} className="font-medium text-red-500">
                  ล้าง
                </button>
              </div>
            ) : null}

            <SectionCard title="ข้อมูลลูกค้า">
              <Field label="ประเภทลูกค้า" required error={errors.ctype}>
                <SelectInput
                  value={form.ctype}
                  onChange={(e) =>
                    setForm({ ...form, ctype: e.target.value as CustomerType })
                  }
                >
                  <option value="">— เลือกประเภท —</option>
                  <option value="individual">บุคคลทั่วไป</option>
                  <option value="business">ร้านค้า / ธุรกิจ</option>
                  <option value="company">บริษัท / นิติบุคคล</option>
                  <option value="online">ร้านค้าออนไลน์</option>
                </SelectInput>
              </Field>

              <Field
                label="ชื่อ-นามสกุล หรือ ชื่อร้าน/บริษัท"
                required
                error={errors.name}
              >
                <TextInput
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="เช่น สมชาย ใจดี / บริษัท สยามแพ็ค จำกัด"
                />
              </Field>

              <Field label="Mobile No." required error={errors.phone}>
                <TextInput
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="0812345678"
                  maxLength={10}
                  inputMode="numeric"
                />
              </Field>

              <Field label="LINE ID หรือ Email" hint="ใช้ส่งใบเสนอราคาฉบับเต็ม">
                <TextInput
                  value={form.contact}
                  onChange={(e) => setForm({ ...form, contact: e.target.value })}
                  placeholder="@myline หรือ email@example.com"
                />
              </Field>
            </SectionCard>

            <div className="flex justify-end">
              <button
                onClick={validateStep1}
                className="rounded-full bg-green-500 px-6 py-3 font-bold text-white transition hover:-translate-y-0.5 hover:bg-green-600"
              >
                ถัดไป →
              </button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4 print:hidden">
            {stockWarning ? (
              <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
                {stockWarning}
              </div>
            ) : null}

            <SectionCard title="เลือกขนาดกล่อง — กล่องหูช้าง ไม่ต้องใช้เทป">
              <div>
                {CATALOG.map((item) => (
                  <ProductRow
                    key={item.code}
                    item={item}
                    remain={stockMap[item.name]}
                    selectedQty={Number(selectedQtyMap[item.code] || 0)}
                    onChange={(qty) =>
                      setSelectedQtyMap((prev) => ({
                        ...prev,
                        [item.code]: qty,
                      }))
                    }
                  />
                ))}
              </div>
            </SectionCard>

            {errors.items ? (
              <p className="px-1 text-sm text-red-500">{errors.items}</p>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => setStep(1)}
                className="rounded-full border border-zinc-300 px-5 py-3 font-bold text-zinc-600 transition hover:border-green-500 hover:text-green-600"
              >
                ← กลับ
              </button>
              <button
                onClick={validateStep2}
                className="rounded-full bg-green-500 px-6 py-3 font-bold text-white transition hover:-translate-y-0.5 hover:bg-green-600"
              >
                ถัดไป →
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4 print:hidden">
            <SectionCard title="ที่อยู่และการจัดส่ง">
              <Field label="ที่อยู่จัดส่ง" required error={errors.address}>
                <TextareaInput
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="เช่น 123/45 ถ.ลาดพร้าว แขวงจอมพล เขตจตุจักร กรุงเทพฯ 10900"
                />
              </Field>

              <Field
                label="วันที่ต้องการรับสินค้า"
                required
                error={errors.deliveryDate}
              >
                <TextInput
                  type="date"
                  min={getTomorrowIsoDate()}
                  value={form.deliveryDate}
                  onChange={(e) =>
                    setForm({ ...form, deliveryDate: e.target.value })
                  }
                />
              </Field>

              <Field label="วิธีชำระเงิน" required error={errors.payment}>
                <SelectInput
                  value={form.payment}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      payment: e.target.value as PaymentMethod | "",
                    })
                  }
                >
                  <option value="">— เลือกวิธีชำระเงิน —</option>
                  <option value="transfer">โอนเงินธนาคาร</option>
                  <option value="cod">เก็บเงินปลายทาง (COD)</option>
                </SelectInput>
              </Field>
            </SectionCard>

            <SectionCard
              title="🧾 ต้องการใบกำกับภาษี (ถ้ามี)"
              tone="amber"
              toggle={() => setShowTaxFields((prev) => !prev)}
              open={showTaxFields}
            >
              {showTaxFields ? (
                <>
                  <Field
                    label="ชื่อบริษัท / ชื่อผู้เสียภาษี"
                    required
                    error={errors.taxName}
                  >
                    <TextInput
                      value={form.taxName}
                      onChange={(e) =>
                        setForm({ ...form, taxName: e.target.value })
                      }
                      placeholder="เช่น บริษัท สยามแพ็ค จำกัด"
                    />
                  </Field>
                  <Field
                    label="เลขประจำตัวผู้เสียภาษี 13 หลัก"
                    required
                    error={errors.taxId}
                  >
                    <TextInput
                      value={form.taxId}
                      onChange={(e) =>
                        setForm({ ...form, taxId: e.target.value })
                      }
                      maxLength={13}
                      inputMode="numeric"
                      placeholder="0105566012345"
                    />
                  </Field>
                  <Field
                    label="สาขา"
                    hint='ถ้าไม่ระบุ จะใช้ "สำนักงานใหญ่" โดยอัตโนมัติ'
                  >
                    <TextInput
                      value={form.taxBranch}
                      onChange={(e) =>
                        setForm({ ...form, taxBranch: e.target.value })
                      }
                      placeholder="สำนักงานใหญ่ / สาขา 001"
                    />
                  </Field>
                  <Field
                    label="ที่อยู่สำหรับออกใบกำกับภาษี"
                    required
                    error={errors.taxAddr}
                  >
                    <TextareaInput
                      value={form.taxAddr}
                      onChange={(e) =>
                        setForm({ ...form, taxAddr: e.target.value })
                      }
                      placeholder="เช่น 123/45 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110"
                    />
                  </Field>
                  <div className="px-4 py-3">
                    <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm leading-7 text-green-700">
                      ทีมงานจะออกใบกำกับภาษีและส่งให้หลังจากชำระเงินแล้ว
                      โดยใช้ข้อมูลชุดเดียวกับใบเสนอราคา
                    </div>
                  </div>
                </>
              ) : null}
            </SectionCard>

            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => setStep(2)}
                className="rounded-full border border-zinc-300 px-5 py-3 font-bold text-zinc-600 transition hover:border-green-500 hover:text-green-600"
              >
                ← กลับ
              </button>
              <button
                onClick={validateStep3}
                className="rounded-full bg-green-500 px-6 py-3 font-bold text-white transition hover:-translate-y-0.5 hover:bg-green-600"
              >
                ดูใบเสนอราคา →
              </button>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            <div className="flex gap-2 print:hidden">
              <button
                onClick={() => setActiveDoc("quote")}
                className={cls(
                  "flex-1 rounded-xl border-2 px-4 py-3 text-sm font-bold transition",
                  activeDoc === "quote"
                    ? "border-green-500 bg-green-50 text-green-700"
                    : "border-zinc-200 bg-white text-zinc-500"
                )}
              >
                📄 ใบเสนอราคา
              </button>
              {showTaxFields ? (
                <button
                  onClick={() => setActiveDoc("tax")}
                  className={cls(
                    "flex-1 rounded-xl border-2 px-4 py-3 text-sm font-bold transition",
                    activeDoc === "tax"
                      ? "border-green-500 bg-green-50 text-green-700"
                      : "border-zinc-200 bg-white text-zinc-500"
                  )}
                >
                  🧾 ใบกำกับภาษี
                </button>
              ) : null}
            </div>

            {activeDoc === "quote" ? (
              <div className="print-area overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg print:overflow-visible print:rounded-none print:border-0 print:shadow-none">
                <div className="flex flex-col justify-between gap-4 bg-green-500 px-6 py-5 text-white sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-white/10">
                      {LOGO_URL ? (
                        <img
                          src={LOGO_URL}
                          alt="ZIPBOX"
                          className="h-14 w-14 object-contain"
                        />
                      ) : (
                        <span className="text-lg font-bold">Z</span>
                      )}
                    </div>
                    <div>
                      <div className="text-xl font-bold">Zipbox</div>
                      <div className="text-xs text-white/80">
                        จำหน่ายและผลิต กล่องลูกฟูก
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">ใบเสนอราคา</div>
                    <div className="text-[11px] tracking-[0.2em] text-white/75">
                      QUOTATION
                    </div>
                    <div className="mt-1 text-xs text-white/90">
                      {quoteNum || genLocalNum("SAL-QTN")}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 border-b border-zinc-200 bg-green-50 px-6 py-4 sm:grid-cols-2 print-avoid-break">
                  <div>
                    <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-green-700">
                      ชื่อลูกค้า
                    </div>
                    <div className="font-semibold">
                      {form.name}{" "}
                      {form.ctype ? `(${CUSTOMER_TYPE_LABELS[form.ctype]})` : ""}
                    </div>
                    <div className="mt-1 text-sm text-zinc-500">
                      {[form.phone, form.contact].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-green-700">
                      วันที่
                    </div>
                    <div className="font-semibold">{thaiDate(now)}</div>
                    <div className="mt-1 text-sm text-zinc-500">
                      ใช้ได้ถึง: {thaiDate(expDate)}
                    </div>
                  </div>
                </div>

                <div className="space-y-4 px-6 py-5">
                  <div className="print-table">
                    <SummaryTable rows={selectedItems} type="quote" />
                  </div>

                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between print-avoid-break">
                    <div className="text-sm text-zinc-600">
                      รวมจำนวน:{" "}
                      <strong className="text-zinc-900">
                        {fmtInt(totals.totalQty)}
                      </strong>
                    </div>
                    <div className="w-full max-w-xs space-y-2 text-sm">
                      <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
                        <span className="text-zinc-500">รวม</span>
                        <span>{fmt(totals.subtotal)}</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
                        <span className="text-zinc-500">VAT @ 7.0</span>
                        <span>{fmt(totals.vat)}</span>
                      </div>
                      <div className="flex items-center justify-between border-t-2 border-green-500 pt-2 font-bold text-green-700">
                        <span>ยอดรวมทั้งหมด:</span>
                        <span>{fmt(totals.total)}</span>
                      </div>
                      <div className="text-right text-xs text-zinc-400">
                        {numberToThaiWords(totals.total)}
                      </div>
                    </div>
                  </div>

                  <div className="whitespace-pre-line rounded-r-lg border-l-4 border-green-500 bg-green-50 px-4 py-3 text-sm leading-7 text-zinc-600 print-avoid-break">
                    {`ที่อยู่จัดส่ง: ${form.address}\nวิธีชำระ: ${
                      form.payment ? PAYMENT_LABELS[form.payment] : ""
                    }\nนัดรับสินค้า: ${thaiDate(form.deliveryDate)}`}
                  </div>
                </div>

                <div className="border-t border-zinc-200 bg-green-50 px-6 py-5">
                  <div className="grid gap-5 lg:grid-cols-3 print-avoid-break">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wide text-green-700">
                        Contact
                      </div>
                      <div className="text-base font-semibold">{form.name}</div>
                      <div className="mt-1 text-sm text-zinc-500">
                        Mobile No: {form.phone}
                      </div>
                    </div>

                    <div className="text-sm leading-7 text-zinc-500">
                      <div>LINE: @zipbox</div>
                      <div>zipboxth@gmail.com</div>
                      <div>095-437-6629</div>
                      <div>468/1 แขวงท่าแร้ง เขตบางเขน กรุงเทพฯ 10220</div>
                    </div>

                    <div className="text-sm text-zinc-500">
                      ลูกค้าสามารถตรวจสอบรายการสินค้า ยอดรวม และลงลายเซ็นยืนยันได้ด้านล่าง
                    </div>
                  </div>

                  <div className="mt-6 grid gap-6 md:grid-cols-2 print-avoid-break">
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4 print:rounded-none">
                      <SignaturePad
                        label="ลายเซ็นลูกค้า / Customer Signature"
                        value={quoteCustomerSignature}
                        onChange={setQuoteCustomerSignature}
                      />
                      <div className="mt-4 border-t border-zinc-300 pt-2 text-center text-sm text-zinc-500">
                        ({form.name || "............................................."})
                      </div>
                    </div>

                    <SellerSignatureBlock
                      signature={quoteSellerSignature}
                      showImage={exportingPdf}
                      name="Zipbox"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {activeDoc === "tax" && showTaxFields ? (
              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg print:hidden">
                <div className="flex flex-col justify-between gap-4 bg-green-500 px-6 py-5 text-white sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-white/10">
                      {LOGO_URL ? (
                        <img
                          src={LOGO_URL}
                          alt="ZIPBOX"
                          className="h-14 w-14 object-contain"
                        />
                      ) : (
                        <span className="text-lg font-bold">Z</span>
                      )}
                    </div>
                    <div>
                      <div className="text-lg font-bold">
                        บริษัท ทริปเปิ้ลวี ควอลิตี้ จำกัด
                      </div>
                      <div className="text-xs text-white/80">
                        จำหน่ายและผลิต กล่องลูกฟูก
                      </div>
                      <div className="mt-1 text-[11px] text-white/70">
                        เลขผู้เสียภาษี: {ZIPBOX_TAX_ID} (สำนักงานใหญ่)
                      </div>
                      <div className="text-[11px] text-white/70">
                        468/1 แขวงท่าแร้ง เขตบางเขน กรุงเทพฯ 10220
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">ใบกำกับภาษี</div>
                    <div className="text-[11px] tracking-[0.2em] text-white/75">
                      TAX INVOICE
                    </div>
                    <div className="mt-1 text-xs text-white/90">
                      {taxNum || genLocalNum("TAX")}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 border-b border-zinc-200 bg-green-50 px-6 py-4 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-green-700">
                      ผู้ซื้อ / Buyer
                    </div>
                    <div className="font-semibold">{form.taxName || "—"}</div>
                    <div className="mt-1 text-sm text-zinc-500">
                      เลขผู้เสียภาษี: {form.taxId || "—"}
                    </div>
                    <div className="text-sm text-zinc-500">
                      {form.taxBranch || "สำนักงานใหญ่"}
                    </div>
                    <div className="mt-2 whitespace-pre-line text-sm text-zinc-500">
                      {form.taxAddr || "—"}
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-green-700">
                      วันที่ออกใบกำกับ
                    </div>
                    <div className="font-semibold">{thaiDate(now)}</div>
                    <div className="mt-1 text-sm text-zinc-500">
                      อ้างอิงใบเสนอราคา: {quoteNum || "—"}
                    </div>
                  </div>
                </div>

                <div className="space-y-4 px-6 py-5">
                  <SummaryTable rows={selectedItems} type="tax" />
                  <div className="ml-auto w-full max-w-xs space-y-2 text-sm">
                    <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
                      <span className="text-zinc-500">มูลค่าสินค้า (ก่อน VAT)</span>
                      <span>{fmt(totals.subtotal)} ฿</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
                      <span className="text-zinc-500">ภาษีมูลค่าเพิ่ม 7%</span>
                      <span>{fmt(totals.vat)} ฿</span>
                    </div>
                    <div className="flex items-center justify-between border-t-2 border-green-500 pt-2 font-bold text-green-700">
                      <span>จำนวนเงินทั้งสิ้น</span>
                      <span>{fmt(totals.total)} ฿</span>
                    </div>
                    <div className="text-right text-xs text-zinc-400">
                      {numberToThaiWords(Math.round(totals.total))}
                    </div>
                  </div>

                  <div className="border-t border-zinc-200 pt-4 text-sm leading-7 text-zinc-500">
                    <div>
                      <strong className="text-zinc-700">เงื่อนไขการชำระเงิน:</strong>{" "}
                      {form.payment ? PAYMENT_LABELS[form.payment] : "—"}
                    </div>
                    <div>
                      <strong className="text-zinc-700">วันที่นัดส่งสินค้า:</strong>{" "}
                      {thaiDate(form.deliveryDate)}
                    </div>
                  </div>
                </div>

                <div className="border-t border-zinc-200 bg-green-50 px-6 py-5">
                  <div className="grid gap-5 lg:grid-cols-3">
                    <div className="text-sm leading-7 text-zinc-500">
                      <div>LINE: @zipbox</div>
                      <div>zipboxth@gmail.com</div>
                      <div>095-437-6629</div>
                    </div>

                    <div className="text-sm text-zinc-500">
                      เอกสารนี้สามารถลงลายเซ็นผ่านเมาส์หรือหน้าจอสัมผัสได้ทันที
                    </div>

                    <div className="text-sm text-zinc-500 lg:text-right">
                      วันที่ออกเอกสาร: {thaiDate(now)}
                    </div>
                  </div>

                  <div className="mt-6 grid gap-6 md:grid-cols-2">
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                      <SignaturePad
                        label="ผู้รับเงิน / Received by"
                        value={taxReceiverSignature}
                        onChange={setTaxReceiverSignature}
                      />
                      <div className="mt-4 border-t border-zinc-300 pt-2 text-center text-sm text-zinc-500">
                        (Zipbox)
                      </div>
                    </div>

                    <SellerSignatureBlock
                      signature={quoteSellerSignature}
                      showImage={false}
                      name="Zipbox"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap justify-center gap-3 print:hidden">
              <button
                onClick={() => setStep(3)}
                className="rounded-full border border-zinc-300 px-5 py-3 font-bold text-zinc-600 transition hover:border-green-500 hover:text-green-600"
              >
                ← แก้ไข
              </button>

              <button
                onClick={exportQuotePdf}
                disabled={exportingPdf}
                className="rounded-full border border-green-500 px-6 py-3 font-bold text-green-700 transition hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {exportingPdf ? "⏳ กำลังเตรียม PDF..." : "📄 Export PDF"}
              </button>

              <button
                onClick={submitQuote}
                disabled={submitting}
                className="rounded-full bg-green-500 px-6 py-3 font-bold text-white transition hover:-translate-y-0.5 hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "⏳ กำลังส่ง..." : "📨 ส่งข้อมูล"}
              </button>
            </div>
          </div>
        ) : null}
      </main>

      {showSuccess ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 print:hidden">
          <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-2xl">
            <div className="mb-2 text-lg font-bold text-zinc-900">
              ✅ ส่งข้อมูลเรียบร้อย
            </div>
            <div className="mb-6 text-sm text-zinc-500">
              ข้อมูลถูกบันทึกลง Google Spreadsheet แล้ว
            </div>
            <button
              onClick={() => setShowSuccess(false)}
              className="rounded-full bg-green-500 px-8 py-3 font-bold text-white hover:bg-green-600"
            >
              ตกลง
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}