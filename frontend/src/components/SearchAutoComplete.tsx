import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/src/theme/ThemeContext";
import { SPACING, RADIUS, FONTS, FONT_SIZE } from "@/src/theme/theme";
import { formatMoney } from "@/src/utils/format";

interface SuggestionItem {
  id: string;
  name: string;
  category?: string;
  price?: number;
  cost?: number;
  stock?: number;
}

interface Props {
  query: string;
  suggestions: SuggestionItem[];
  onSelect: (item: SuggestionItem) => void;
  currency?: string;
  visible: boolean;
}

export function SearchAutoComplete({ query, suggestions, onSelect, currency = "PEN", visible }: Props) {
  const { colors } = useTheme();

  if (!visible || !query.trim() || suggestions.length === 0) {
    return null;
  }

  // Resalta las letras que coinciden en negrita estilo Google
  const renderHighlightedText = (text: string, highlight: string) => {
    const parts = text.split(new RegExp(`(${highlight})`, "gi"));
    return (
      <Text style={[styles.itemText, { color: colors.onSurface }]} numberOfLines={1}>
        {parts.map((part, i) =>
          part.toLowerCase() === highlight.toLowerCase() ? (
            <Text key={i} style={[styles.matchText, { color: colors.brand }]}>
              {part}
            </Text>
          ) : (
            part
          )
        )}
      </Text>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={{ maxHeight: 220 }}
      >
        {suggestions.slice(0, 6).map((item) => (
          <Pressable
            key={item.id}
            onPress={() => onSelect(item)}
            style={({ pressed }) => [
              styles.itemRow,
              { borderBottomColor: colors.border },
              pressed && { backgroundColor: colors.surfaceSecondary },
            ]}
          >
            <View style={styles.iconContainer}>
              <Feather name="search" size={14} color={colors.onSurfaceTertiary} />
            </View>

            <View style={{ flex: 1, marginRight: SPACING.sm }}>
              {renderHighlightedText(item.name, query.trim())}
              {item.category ? (
                <Text style={[styles.subText, { color: colors.onSurfaceTertiary }]}>
                  {item.category}
                </Text>
              ) : null}
            </View>

            {item.stock !== undefined ? (
              <View style={styles.badgeContainer}>
                <Text style={[styles.stockBadgeText, { color: colors.onSurfaceSecondary }]}>
                  Stock: {item.stock}
                </Text>
                {item.price ? (
                  <Text style={[styles.priceBadgeText, { color: colors.brand }]}>
                    {formatMoney(item.price, currency)}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    width: "100%",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    overflow: "hidden",
    marginTop: 4,
    marginBottom: SPACING.xs,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    zIndex: 50,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconContainer: {
    marginRight: SPACING.sm,
    opacity: 0.7,
  },
  itemText: {
    fontFamily: FONTS.medium,
    fontSize: FONT_SIZE.sm,
  },
  matchText: {
    fontFamily: FONTS.black,
  },
  subText: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    marginTop: 1,
  },
  badgeContainer: {
    alignItems: "flex-end",
  },
  stockBadgeText: {
    fontFamily: FONTS.medium,
    fontSize: 10,
  },
  priceBadgeText: {
    fontFamily: FONTS.bold,
    fontSize: FONT_SIZE.xs,
  },
});
