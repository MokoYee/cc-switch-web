import { startTransition, useEffect, useState } from "react";

type ProgressiveListProps<T> = {
  readonly items: readonly T[];
  readonly locale: "zh-CN" | "en-US";
  readonly renderItem: (item: T, index: number) => JSX.Element;
  readonly initialVisibleCount?: number;
  readonly step?: number;
  readonly totalCount?: number | null;
};

const localize = (locale: "zh-CN" | "en-US", zhCN: string, enUS: string): string =>
  locale === "zh-CN" ? zhCN : enUS;

export const ProgressiveList = <T,>({
  items,
  locale,
  renderItem,
  initialVisibleCount = 16,
  step = 16,
  totalCount = null
}: ProgressiveListProps<T>): JSX.Element => {
  const normalizedInitialVisibleCount = Math.max(1, initialVisibleCount);
  const normalizedStep = Math.max(1, step);
  const shouldProgressivelyRender = items.length > normalizedInitialVisibleCount;
  const [visibleCount, setVisibleCount] = useState(() =>
    shouldProgressivelyRender ? normalizedInitialVisibleCount : items.length
  );

  useEffect(() => {
    setVisibleCount(shouldProgressivelyRender ? normalizedInitialVisibleCount : items.length);
  }, [items.length, normalizedInitialVisibleCount, shouldProgressivelyRender]);

  const effectiveVisibleCount = shouldProgressivelyRender ? Math.min(visibleCount, items.length) : items.length;
  const visibleItems = items.slice(0, effectiveVisibleCount);
  const hasMore = effectiveVisibleCount < items.length;

  return (
    <>
      {visibleItems.map((item, index) => renderItem(item, index))}
      {shouldProgressivelyRender ? (
        <div className="progressive-list-footer">
          <span className="progressive-list-meta">
            {localize(
              locale,
              `当前渲染 ${effectiveVisibleCount} / ${items.length}${totalCount !== null && totalCount > items.length ? `，总计 ${totalCount}` : ""}`,
              `Rendering ${effectiveVisibleCount} / ${items.length}${totalCount !== null && totalCount > items.length ? `, total ${totalCount}` : ""}`
            )}
          </span>
          <div className="quick-action-row">
            {hasMore ? (
              <button
                className="inline-action"
                type="button"
                onClick={() => {
                  startTransition(() => {
                    setVisibleCount((current) => Math.min(items.length, current + normalizedStep));
                  });
                }}
              >
                {localize(
                  locale,
                  `继续加载 ${Math.min(normalizedStep, items.length - effectiveVisibleCount)} 条`,
                  `Show ${Math.min(normalizedStep, items.length - effectiveVisibleCount)} More`
                )}
              </button>
            ) : null}
            {hasMore ? (
              <button
                className="inline-action"
                type="button"
                onClick={() => {
                  startTransition(() => {
                    setVisibleCount(items.length);
                  });
                }}
              >
                {localize(locale, "展开当前页全部", "Show Full Page")}
              </button>
            ) : null}
            {!hasMore ? (
              <button
                className="inline-action"
                type="button"
                onClick={() => {
                  startTransition(() => {
                    setVisibleCount(normalizedInitialVisibleCount);
                  });
                }}
              >
                {localize(locale, "收起长列表", "Collapse List")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
};
