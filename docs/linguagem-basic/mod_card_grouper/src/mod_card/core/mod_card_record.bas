
Imports mod_base_list
Imports mod_pipeline_record

'@Module
Namespace mod_card_record

   Class CardRecord
      Inherits TRecord

      Sub New(pIndex As Integer)
         MyBase.New(pIndex)
      End Sub

      Sub New(pValue As CardRecord)
         MyBase.New(pValue)
      End Sub

      Property Estabelecimento As String
         Get
            Estabelecimento = me.Cell("Estabelecimento").Value.AsDefault
         End Get
         Set(pValue As String)
            me.Cell("Estabelecimento").Value.Value = pValue
         End Set
      End Property

      Property Bandeira As String
         Get
            console.log(me.Cell("Bandeira").Value = NULL)
            Bandeira = me.Cell("Bandeira").Value.AsDefault
         End Get
         Set(pValue As String)
            me.Cell("Bandeira").Value.Value = pValue
         End Set
      End Property

      Property NumeroCartao As String
         Get
            NumeroCartao = me.Cell("NumeroCartao").Value.AsDefault
         End Get
         Set(pValue As String)
            me.Cell("NumeroCartao").Value.Value = pValue
         End Set
      End Property

      Property NumeroAutorizacao As String
         Get
            NumeroAutorizacao = me.Cell("NumeroAutorizacao").Value.AsDefault
         End Get
         Set(pValue As String)
            me.Cell("NumeroAutorizacao").Value.Value = pValue
         End Set
      End Property

      Property NumeroParcela As Integer
         Get
            NumeroParcela = me.Cell("NumeroParcela").Value.AsInteger
         End Get
         Set(pValue As Integer)
            me.Cell("NumeroParcela").Value.Value = pValue
         End Set
      End Property

      Property QuantidadeParcela As Integer
         Get
            QuantidadeParcela = me.Cell("QuantidadeParcela").Value.AsInteger
         End Get
         Set(pValue As Integer)
            me.Cell("QuantidadeParcela").Value.Value = pValue
         End Set
      End Property

      Property DataVenda As TDateTime
         Get
            DataVenda = me.Cell("DataVenda").Value.AsDateTime
         End Get
         Set(pValue As TDateTime)
            me.Cell("DataVenda").Value.Value = pValue
         End Set
      End Property

      Property DataPagamento As TDateTime
         Get
            DataPagamento = me.Cell("DataPagamento").Value.AsDateTime
         End Get
         Set(pValue As TDateTime)
            me.Cell("DataPagamento").Value.Value = pValue
         End Set
      End Property

      Property ValorBruto As Extended
         Get
            ValorBruto = me.Cell("ValorBruto").Value.AsFloat
         End Get
         Set(pValue As Extended)
            me.Cell("ValorBruto").Value.Value = pValue
         End Set
      End Property

      Property ValorLiquido As Extended
         Get
            ValorLiquido = me.Cell("ValorLiquido").Value.AsFloat
         End Get
         Set(pValue As Extended)
            me.Cell("ValorLiquido").Value.Value = pValue
         End Set
      End Property

      Function Copy() As CardRecord
         Copy = New CardRecord(me)
      End Function

      Overrides Function ToString(pPrint As Boolean = False) As String
         With console.Block("CardRecord")
            .Prop("Estabelecimento", me.Estabelecimento)
            .Prop("Bandeira", me.Bandeira)
            .Prop("NumeroCartao", me.NumeroCartao)
            .Prop("NumeroAutorizacao", me.NumeroAutorizacao)
            .Prop("NumeroParcela", me.NumeroParcela)
            .Prop("QuantidadeParcela", me.QuantidadeParcela)
            .Prop("DataVenda", me.DataVenda.ToString())
            .Prop("DataPagamento", me.DataPagamento.ToString())
            .Prop("ValorBruto", me.ValorBruto)
            .Prop("ValorLiquido", me.ValorLiquido)
            .Prop("Cells.Count", me.Cells.Count())
            .Close()
            .Printe(pPrint)
            ToString = .Text
            .Free()
         End With
      End Function

      Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Delegate Function CardRecordFindDelegate(pValue As CardRecord, i As Integer, extra As Variant) As Boolean
   Delegate Function CardRecordMapDelegate(pValue As CardRecord, i As Integer, extra As Variant) As CardRecord
   Delegate Sub CardRecordForEachDelegate(pValue As CardRecord, i As Integer, extra As Variant)

   Class CardRecordList
      Inherits TRecordList

      Sub New()
         MyBase.New("CardRecordList")
      End Sub

      Property Item(pIndex As Integer) As CardRecord
         Get
            Item = CType(MyBase.Take(pIndex), CardRecord)
         End Get
         Set(pValue As CardRecord)
            me.SetItem(pIndex, pValue)
         End Set
      End Property

      Function Take(pIndex As String) As CardRecord
         Take = CType(MyBase.TakeFromId(pIndex), CardRecord)
      End Function

      Function Take(pIndex As Integer) As CardRecord
         Take = CType(MyBase.Take(pIndex), CardRecord)
      End Function

      Function First As CardRecord
         First = CType(MyBase.First, CardRecord)
      End Function

      Function First(pLimit As Integer) As CardRecordList
         First = CType(MyBase.Range(pLimit, False), CardRecordList)
      End Function

      Function Last As CardRecord
         Last = CType(MyBase.Last, CardRecord)
      End Function

      Function Last(pLimit As Integer) As CardRecordList
         Last = CType(MyBase.Range(pLimit, True), CardRecordList)
      End Function

      Function Copy As CardRecordList
         Copy = CType(MyBase.Copy(), CardRecordList)
      End Function

      Function IndexOf(handler As CardRecordFindDelegate) As Integer
         IndexOf = me.IndexOf(handler, "")
      End Function

      Function IndexOf(handler As CardRecordFindDelegate, extra As Variant) As Integer
         IndexOf = MyBase.IndexOf(handler, extra)
      End Function

      Function Find(handler As CardRecordFindDelegate) As CardRecord
         Find = me.Find(handler, "")
      End Function

      Function Find(handler As CardRecordFindDelegate, extra As Variant) As CardRecord
         Find = CType(MyBase.Find(handler, extra), CardRecord)
      End Function

      Function Filter(handler As CardRecordFindDelegate) As CardRecordList
         Filter = me.Filter(handler, "")
      End Function

      Function Filter(handler As CardRecordFindDelegate, extra As Variant) As CardRecordList
         Filter = CType(MyBase.Filter(handler, extra), CardRecordList)
      End Function

      Sub ForEach(handler As CardRecordFindDelegate)
         me.ForEach(handler, "")
      End Sub

      Sub ForEach(handler As CardRecordForEachDelegate, extra As Variant)
         MyBase.ForEach(handler, extra)
      End Sub

      Function Map(handler As CardRecordFindDelegate) As CardRecordList
         Map = me.Map(handler, "")
      End Function

      Function Map(handler As CardRecordMapDelegate, extra As Variant) As CardRecordList
         With CType(MyBase.Map(handler, extra), CardRecordList)
            Map = .Copy()
         End With
      End Function

   End Class

End Namespace