
'Imports mod_card_adm
'Imports mod_card_mapper
Imports mod_card_record
Imports mod_pipeline_record
Imports mod_pipeline_schema
Imports mod_pipeline_navigator
Imports mod_pipeline_extractor

'@Module
Namespace mod_card_extractor

   Class CardExtractor
      Inherits TExtractor

      Sub New()
         MyBase.New("CardExtractor")
      End Sub

      'Sub New(pCardAdm As CardAdm, pNavigator As TNavigator)
      '   Dim _mapper As CardMapper = CardMapper.Load(pCardAdm)
      '   MyBase.New("CardExtractor", _mapper.Schema, _mapper.Navigator)
      'End Sub

      'Sub New(pMapper As CardMapper)
      '   MyBase.New("CardExtractor", pMapper.Schema, pMapper.Navigator)
      'End Sub

      'Function Execute() As CardRecordList
      '   Execute = me.Execute(me._schema, me._navigator)
      'End Function

      Function Execute(pSchema As TSchema, pNavigator As TNavigator) As CardRecordList
         Dim _baseitens As TRecordList = MyBase.Execute(pSchema, pNavigator)
         Dim _items As New CardRecordList()
         Dim i As Integer, count As Integer = _baseitens.Count - 1
         For i = 0 To count
            _items.Add(New CardRecord(_baseitens.Take(i)))
         Next
         Execute = _items
         _baseitens.Free()
      End Function

      Sub Free()
         MyBase.Free()
      End Sub

   End Class

End Namespace