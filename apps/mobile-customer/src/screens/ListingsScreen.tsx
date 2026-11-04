import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { gql } from '../api';
import { LISTINGS, type ListingRow, type ListingsData } from '../queries';
import { Button, Loading, Notice, money, styles } from '../ui';

const STOCK: Record<string, string> = { IN_STOCK: 'In stock', LOW: 'Low stock', SOLD_OUT: 'Sold out' };

export function ListingsScreen(props: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<ListingRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const data = await gql<ListingsData>(LISTINGS);
      setRows(data.listings.edges.map((e) => e.node));
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => void load(), [load]);

  if (failed) {
    return (
      <View style={styles.pad}>
        <Notice text="The menu could not be loaded." testID="listings-error">
          <Button label="Try again" onPress={load} testID="listings-retry" />
        </Notice>
      </View>
    );
  }
  if (!rows) return <Loading />;
  return (
    <FlatList
      testID="listings"
      contentContainerStyle={styles.pad}
      data={rows}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => (
        <Pressable
          testID={`listing-${item.name}`}
          accessibilityRole="button"
          onPress={() => props.onOpen(item.id)}
          style={styles.card}
        >
          <Text style={styles.text}>{item.name}</Text>
          <View style={styles.row}>
            <Text style={styles.muted}>{money(item.price)}</Text>
            <Text style={styles.muted}>{STOCK[item.stock.status] ?? item.stock.status}</Text>
          </View>
        </Pressable>
      )}
    />
  );
}
