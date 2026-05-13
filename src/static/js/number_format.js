export function normalizeCount(value) {
    const parsed = Number.parseInt(String(value ?? 0), 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return 0;
    }
    return parsed;
}

export function formatCompactCount(value) {
    const normalizedValue = normalizeCount(value);
    if (normalizedValue < 1000) {
        return String(normalizedValue);
    }

    const scales = [
        { value: 1_000_000_000_000, suffix: 'T' },
        { value: 1_000_000_000, suffix: 'B' },
        { value: 1_000_000, suffix: 'M' },
        { value: 1_000, suffix: 'K' }
    ];

    for (const scale of scales) {
        if (normalizedValue < scale.value) {
            continue;
        }

        const rounded = Math.round((normalizedValue / scale.value) * 10) / 10;
        const compactValue = Number.isInteger(rounded) ? String(rounded) : String(rounded.toFixed(1));
        return `${compactValue}${scale.suffix}`;
    }

    return String(normalizedValue);
}

export function formatCountHoverTitle(label, value) {
    const normalizedValue = normalizeCount(value);
    const normalizedLabel = String(label || '').trim().toLowerCase();
    const suffix = normalizedValue === 1 ? normalizedLabel : `${normalizedLabel}s`;
    return `${normalizedValue} ${suffix}`;
}
