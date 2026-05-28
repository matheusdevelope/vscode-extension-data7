' @example: sugar/default-indexer/01-basic
' @demonstrates: convenção `Property Item(...)` para indexação tipada
' @diagnostics: none
'
' O default indexer `list(i)` ainda NÃO é transpilado automaticamente
' (depende do linter saber que o tipo declara `Item(Integer)`). A
' convenção atual é declarar Property Item e chamar list.Item(0) — vide
' docs/linguagem-basic/mod_card_grouper/src/mod_card/core/mod_card_record.bas.
'
Namespace mod_demo

   Class CardRecordList
      Inherits TRecordList

      Property Item(pIndex As Integer) As CardRecord
         Get
            Item = CType(MyBase.Take(pIndex), CardRecord)
         End Get
         Set(pValue As CardRecord)
            me.SetItem(pIndex, pValue)
         End Set
      End Property

   End Class

End Namespace
