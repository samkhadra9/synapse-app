/**
 * FloatingAddButton — quick task capture overlay
 * Drop anywhere on screen: <FloatingAddButton />
 */
import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  TextInput, KeyboardAvoidingView, Platform, TouchableWithoutFeedback,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, addDays } from 'date-fns';
import { useColors, Spacing, Radius } from '../theme';
import { useStore } from '../store/useStore';

type When = 'today' | 'tomorrow' | 'inbox';

export default function FloatingAddButton() {
  const C = useColors();
  const insets = useSafeAreaInsets();
  const addTask = useStore(s => s.addTask);

  const [open, setOpen]     = useState(false);
  const [text, setText]     = useState('');
  const [when, setWhen]     = useState<When>('inbox');
  const inputRef = useRef<TextInput>(null);

  const today    = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');

  function handleAdd() {
    const t = text.trim();
    if (!t) return;
    const date = when === 'today' ? today : when === 'tomorrow' ? tomorrow : '';
    addTask({
      text: t,
      date,
      isToday:   when === 'today',
      isMIT:     false,
      isInbox:   when === 'inbox',
      completed: false,
      priority:  'medium',
    });
    setText('');
    setWhen('inbox');
    setOpen(false);
  }

  const s = makeStyles(C, insets.bottom);

  return (
    <>
      {/* Floating button */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 100); }}
        activeOpacity={0.85}
      >
        <Text style={s.fabIcon}>+</Text>
      </TouchableOpacity>

      {/* Quick-add sheet */}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setOpen(false)}>
          <View style={s.backdrop} />
        </TouchableWithoutFeedback>

        <KeyboardAvoidingView
          style={s.sheetWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          pointerEvents="box-none"
        >
          <View style={s.sheet}>
            <TextInput
              ref={inputRef}
              style={s.input}
              placeholder="Capture a thought…"
              placeholderTextColor={C.textTertiary}
              value={text}
              onChangeText={setText}
              onSubmitEditing={handleAdd}
              returnKeyType="done"
              autoFocus
            />

            {/* When row */}
            <View style={s.whenRow}>
              {(['inbox', 'today', 'tomorrow'] as When[]).map(w => (
                <TouchableOpacity
                  key={w}
                  style={[s.whenChip, when === w && s.whenChipActive]}
                  onPress={() => setWhen(w)}
                >
                  <Text style={[s.whenChipText, when === w && { color: C.primary, fontWeight: '700' }]}>
                    {w === 'inbox' ? 'Inbox' : w === 'today' ? 'Today' : 'Tomorrow'}
                  </Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity style={s.addBtn} onPress={handleAdd} activeOpacity={0.85}>
                <Text style={s.addBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function makeStyles(C: any, bottomInset: number) {
  return StyleSheet.create({
    fab: {
      position:        'absolute',
      bottom:          90 + bottomInset,
      right:           20,
      width:           52,
      height:          52,
      borderRadius:    26,
      backgroundColor: C.ink,
      alignItems:      'center',
      justifyContent:  'center',
      shadowColor:     '#000',
      shadowOffset:    { width: 0, height: 4 },
      shadowOpacity:   0.20,
      shadowRadius:    12,
      elevation:       8,
    },
    fabIcon: { color: C.textInverse, fontSize: 28, lineHeight: 32, fontWeight: '300' },

    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
    sheetWrap: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor:       C.surface,
      borderTopLeftRadius:   Radius.xl,
      borderTopRightRadius:  Radius.xl,
      padding:               Spacing.base,
      paddingBottom:         Spacing.base + bottomInset,
      gap:                   12,
    },
    input: {
      fontSize:           18,
      color:              C.textPrimary,
      paddingVertical:    12,
      borderBottomWidth:  1,
      borderBottomColor:  C.borderLight,
    },
    whenRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
    whenChip: {
      paddingHorizontal: 14,
      paddingVertical:   8,
      borderRadius:      Radius.full,
      borderWidth:       1.5,
      borderColor:       C.border,
      backgroundColor:   C.surface,
    },
    whenChipActive: { backgroundColor: C.primaryLight, borderColor: C.primaryMid },
    whenChipText:   { fontSize: 13, color: C.textSecondary, fontWeight: '500' },
    addBtn: {
      marginLeft:       'auto' as any,
      backgroundColor:  C.ink,
      paddingHorizontal: 20,
      paddingVertical:  8,
      borderRadius:     Radius.full,
    },
    addBtnText: { color: C.textInverse, fontWeight: '700', fontSize: 14 },
  });
}
