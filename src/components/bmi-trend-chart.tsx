import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { useAppTheme } from '@/theme/use-app-theme';
import type { BmiMeasurement, BmiMetric } from '@/types/bmi';
import type { WeightUnit } from '@/types/workout';
import { getChartDomain } from '@/utils/bmi';

interface BmiTrendChartProps {
  measurements: BmiMeasurement[];
  metric: BmiMetric;
  weightUnit: WeightUnit;
}

const CHART_HEIGHT = 214;
const PADDING = { top: 16, right: 14, bottom: 30, left: 42 };

function valueFor(measurement: BmiMeasurement, metric: BmiMetric, weightUnit: WeightUnit): number {
  if (metric === 'bmi') return measurement.bmi;
  return weightUnit === 'kg' ? measurement.weightKg : measurement.weightLb;
}

function valueLabel(value: number, metric: BmiMetric): string {
  return metric === 'bmi' ? value.toFixed(1) : value.toFixed(1);
}

export function BmiTrendChart({
  measurements,
  metric,
  weightUnit,
}: BmiTrendChartProps): React.ReactElement {
  const theme = useAppTheme();
  const [width, setWidth] = React.useState(0);
  const ordered = React.useMemo(
    () => [...measurements].sort((a, b) => a.measuredAt - b.measuredAt),
    [measurements],
  );
  const values = ordered.map((measurement) => valueFor(measurement, metric, weightUnit));
  const domain = getChartDomain(values, metric);
  const firstValue = values.at(0);
  const lastValue = values.at(-1);
  const unitLabel = metric === 'bmi' ? 'BMI' : weightUnit;
  const summary =
    firstValue === undefined || lastValue === undefined
      ? `No ${unitLabel} measurements in this range`
      : ordered.length === 1
        ? `One ${unitLabel} measurement, ${valueLabel(lastValue, metric)}`
        : `${unitLabel} changed from ${valueLabel(firstValue, metric)} to ${valueLabel(lastValue, metric)}, ${lastValue >= firstValue ? 'up' : 'down'} ${Math.abs(lastValue - firstValue).toFixed(1)}`;

  if (ordered.length === 0) {
    return (
      <View
        accessibilityRole="summary"
        accessibilityLabel={summary}
        style={{
          minHeight: 150,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          gap: 5,
        }}
      >
        <Text
          selectable
          style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800', textAlign: 'center' }}
        >
          No measurements in this range
        </Text>
        <Text
          selectable
          style={{ color: theme.colors.textMuted, fontSize: 13, textAlign: 'center' }}
        >
          Choose a longer range or add a new measurement.
        </Text>
      </View>
    );
  }

  const plotWidth = Math.max(1, width - PADDING.left - PADDING.right);
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const firstTime = ordered[0].measuredAt;
  const lastTime = ordered[ordered.length - 1].measuredAt;
  const timeSpan = Math.max(1, lastTime - firstTime);
  const valueSpan = Math.max(Number.EPSILON, domain.max - domain.min);
  const points = ordered.map((measurement) => {
    const x =
      ordered.length === 1
        ? PADDING.left + plotWidth / 2
        : PADDING.left + ((measurement.measuredAt - firstTime) / timeSpan) * plotWidth;
    const value = valueFor(measurement, metric, weightUnit);
    const y = PADDING.top + (1 - (value - domain.min) / valueSpan) * plotHeight;
    return { x, y, value, id: measurement.id };
  });
  const dateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={summary}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ width: '100%', minHeight: CHART_HEIGHT }}
    >
      {width > 0 ? (
        <Svg width={width} height={CHART_HEIGHT}>
          {[0, 0.5, 1].map((fraction) => {
            const y = PADDING.top + fraction * plotHeight;
            const value = domain.max - fraction * valueSpan;
            return (
              <React.Fragment key={fraction}>
                <Line
                  x1={PADDING.left}
                  x2={width - PADDING.right}
                  y1={y}
                  y2={y}
                  stroke={theme.colors.border}
                  strokeWidth={1}
                  strokeDasharray="4 5"
                />
                <SvgText
                  x={PADDING.left - 7}
                  y={y + 4}
                  textAnchor="end"
                  fill={theme.colors.textMuted}
                  fontSize={11}
                >
                  {valueLabel(value, metric)}
                </SvgText>
              </React.Fragment>
            );
          })}
          {points.length > 1 ? (
            <Polyline
              points={points.map((point) => `${point.x},${point.y}`).join(' ')}
              fill="none"
              stroke={theme.colors.accent}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {points.map((point) => (
            <Circle
              key={point.id}
              cx={point.x}
              cy={point.y}
              r={4.5}
              fill={theme.colors.surface}
              stroke={theme.colors.accent}
              strokeWidth={3}
            />
          ))}
          <SvgText
            x={PADDING.left}
            y={CHART_HEIGHT - 7}
            fill={theme.colors.textMuted}
            fontSize={11}
          >
            {dateFormatter.format(new Date(firstTime))}
          </SvgText>
          <SvgText
            x={width - PADDING.right}
            y={CHART_HEIGHT - 7}
            textAnchor="end"
            fill={theme.colors.textMuted}
            fontSize={11}
          >
            {dateFormatter.format(new Date(lastTime))}
          </SvgText>
        </Svg>
      ) : null}
    </View>
  );
}
