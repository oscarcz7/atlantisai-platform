'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  keywords?: string;
  disabled?: boolean;
}

export interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  variant?: 'default' | 'compact' | 'bare';
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}

function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

interface MenuPosition {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Seleccionar...',
  searchPlaceholder,
  emptyMessage = 'Sin resultados',
  disabled = false,
  variant = 'default',
  ariaLabel,
  className,
  style,
}: SearchableSelectProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return options;
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    return options.filter((opt) => {
      const haystack = normalizeText(
        `${opt.label} ${opt.description ?? ''} ${opt.keywords ?? ''}`,
      );
      return tokens.every((token) => haystack.includes(token));
    });
  }, [options, query]);

  const updatePosition = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const gap = 6;
    const minMenuWidth = variant === 'bare' ? Math.max(rect.width, 220) : Math.max(rect.width, 180);
    const width = Math.min(minMenuWidth, viewportW - 16);
    const left = Math.max(8, Math.min(rect.left, viewportW - width - 8));

    const spaceBelow = viewportH - rect.bottom - gap - 12;
    const spaceAbove = rect.top - gap - 12;
    const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;

    if (openUpward) {
      setPosition({
        left,
        width,
        bottom: viewportH - rect.top + gap,
        maxHeight: Math.min(280, Math.max(140, spaceAbove)),
      });
    } else {
      setPosition({
        left,
        width,
        top: rect.bottom + gap,
        maxHeight: Math.min(280, Math.max(140, spaceBelow)),
      });
    }
  }, [variant]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const openMenu = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    const currentIdx = options.findIndex((o) => o.value === value && !o.disabled);
    setHighlightedIndex(currentIdx >= 0 ? currentIdx : 0);
  }, [disabled, options, value]);

  const selectOption = useCallback(
    (opt: SelectOption) => {
      if (opt.disabled) return;
      onChange(opt.value);
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
    },
    [onChange],
  );

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition, filteredOptions.length]);

  useEffect(() => {
    if (!open) return;
    const handleScrollOrResize = () => updatePosition();
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (
        containerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      closeMenu();
    };
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [open, updatePosition, closeMenu]);

  useEffect(() => {
    if (!open) return;
    if (highlightedIndex >= filteredOptions.length) {
      setHighlightedIndex(0);
    }
  }, [filteredOptions.length, highlightedIndex, open]);

  useEffect(() => {
    if (!open) return;
    const el = optionRefs.current[highlightedIndex];
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, open]);

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;

    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault();
        openMenu();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredOptions.length === 0) return;
      setHighlightedIndex((prev) => {
        let next = (prev + 1) % filteredOptions.length;
        let guard = 0;
        while (filteredOptions[next]?.disabled && guard < filteredOptions.length) {
          next = (next + 1) % filteredOptions.length;
          guard++;
        }
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredOptions.length === 0) return;
      setHighlightedIndex((prev) => {
        let next = (prev - 1 + filteredOptions.length) % filteredOptions.length;
        let guard = 0;
        while (filteredOptions[next]?.disabled && guard < filteredOptions.length) {
          next = (next - 1 + filteredOptions.length) % filteredOptions.length;
          guard++;
        }
        return next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredOptions[highlightedIndex];
      if (target && !target.disabled) {
        selectOption(target);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
      inputRef.current?.blur();
    } else if (e.key === 'Tab') {
      closeMenu();
    }
  }

  const resolvedPlaceholder = open
    ? (searchPlaceholder ??
      (selectedOption ? `Buscar... (${selectedOption.label})` : 'Buscar...'))
    : placeholder;

  const variantClass =
    variant === 'compact'
      ? 'h-select-compact'
      : variant === 'bare'
        ? 'h-select-bare'
        : 'h-select-default';

  return (
    <div
      ref={containerRef}
      className={`h-select ${variantClass} ${open ? 'h-select-open' : ''} ${disabled ? 'h-select-disabled' : ''} ${className ?? ''}`}
      style={style}
    >
      {open && (
        <Search size={variant === 'default' ? 14 : 13} className="h-select-search-icon" aria-hidden="true" />
      )}
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        disabled={disabled}
        value={open ? query : (selectedOption?.label ?? '')}
        placeholder={resolvedPlaceholder}
        className="h-select-input"
        onFocus={() => {
          if (!open) openMenu();
        }}
        onClick={() => {
          if (!open) openMenu();
        }}
        onChange={(e) => {
          if (!open) setOpen(true);
          setQuery(e.target.value);
          setHighlightedIndex(0);
        }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        spellCheck={false}
      />
      {open && query ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Limpiar búsqueda"
          className="h-select-action"
          onMouseDown={(e) => {
            e.preventDefault();
            setQuery('');
            setHighlightedIndex(0);
            inputRef.current?.focus();
          }}
        >
          <X size={13} />
        </button>
      ) : (
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={open ? 'Cerrar opciones' : 'Abrir opciones'}
          className="h-select-action"
          onMouseDown={(e) => {
            e.preventDefault();
            if (disabled) return;
            if (open) {
              closeMenu();
              inputRef.current?.blur();
            } else {
              inputRef.current?.focus();
              openMenu();
            }
          }}
        >
          <ChevronDown
            size={variant === 'default' ? 15 : 14}
            className={`h-select-chevron ${open ? 'h-select-chevron-open' : ''}`}
          />
        </button>
      )}

      {open &&
        position &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            className="h-select-menu"
            style={{
              left: `${position.left}px`,
              width: `${position.width}px`,
              top: position.top !== undefined ? `${position.top}px` : undefined,
              bottom: position.bottom !== undefined ? `${position.bottom}px` : undefined,
              maxHeight: `${position.maxHeight}px`,
            }}
          >
            {filteredOptions.length === 0 ? (
              <div className="h-select-empty">{emptyMessage}</div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted = idx === highlightedIndex;
                return (
                  <button
                    key={opt.value}
                    ref={(el) => {
                      optionRefs.current[idx] = el;
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    className={`h-select-option ${isSelected ? 'h-select-option-selected' : ''} ${isHighlighted ? 'h-select-option-highlighted' : ''}`}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectOption(opt);
                    }}
                  >
                    <span className="h-select-option-copy">
                      <span className="h-select-option-label">{opt.label}</span>
                      {opt.description && (
                        <span className="h-select-option-desc">{opt.description}</span>
                      )}
                    </span>
                    {isSelected && <Check size={14} className="h-select-check" />}
                  </button>
                );
              })
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
