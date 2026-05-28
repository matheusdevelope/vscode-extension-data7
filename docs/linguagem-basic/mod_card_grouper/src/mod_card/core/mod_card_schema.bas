
Imports mod_card_adm
Imports mod_pipeline_field
Imports mod_pipeline_schema

'@Module
Namespace mod_card_schema

   Class CardSchema
      Inherits TSchema

      ReadOnly Adm As CardAdm

      Estabelecimento As TField = New TField("Estabelecimento")
      Bandeira As TField = New TField("Bandeira")
      NumeroCartao As TField = New TField("NumeroCartao")
      NumeroAutorizacao As TField = New TField("NumeroAutorizacao")
      NumeroParcela As TField = New TField("NumeroParcela")
      QuantidadeParcela As TField = New TField("QuantidadeParcela")
      DataVenda As TField = New TField("DataVenda")
      DataPagamento As TField = New TField("DataPagamento")
      ValorBruto As TField = New TField("ValorBruto")
      ValorLiquido As TField = New TField("ValorLiquido")

      Sub New(pAdm As CardAdm)
         MyBase.New("CardMapper-" + pAdm.AsString)
         me.Adm = pAdm
         me.Window.MinRow = 0
         me.Window.MaxRow = 9
         me.Fields.Add(me.Estabelecimento)
         me.Fields.Add(me.Bandeira)
         me.Fields.Add(me.NumeroCartao)
         me.Fields.Add(me.NumeroAutorizacao)
         me.Fields.Add(me.NumeroParcela)
         me.Fields.Add(me.QuantidadeParcela)
         me.Fields.Add(me.DataVenda)
         me.Fields.Add(me.DataPagamento)
         me.Fields.Add(me.ValorBruto)
         me.Fields.Add(me.ValorLiquido)
      End Sub

      Shared Function Load(pAdm As CardAdm) As CardSchema
         If pAdm = NULL Then Throw New Exception("Invalid CardAdm, NULL is not accepted.")
         Select pAdm
            Case CardAdm.Stone
               Load = New mod_card_stone.CardSchemaStone()
            ' TODO:
            'Case CardAdm.Cielo
            '   Load = New mod_card_stone.CardSchemaCielo()
            Case Else
               Throw New Exception("CardAdm [" + pAdm.AsString + "] not supported, you must implement that resolver before using it.")
         End Select
      End Function

      Function ToString(pPrint As Boolean = False) As String
         With console.Block(me._name)
            .Prop("Fields.Count", me.Fields.Count())
            .Prop("Estabelecimento", me.Estabelecimento.ToString())
            .Prop("Bandeira", me.Bandeira.ToString())
            .Prop("NumeroCartao", me.NumeroCartao.ToString())
            .Prop("NumeroAutorizacao", me.NumeroAutorizacao.ToString())
            .Prop("NumeroParcela", me.NumeroParcela.ToString())
            .Prop("QuantidadeParcela", me.QuantidadeParcela.ToString())
            .Prop("DataVenda", me.DataVenda.ToString())
            .Prop("DataPagamento", me.DataPagamento.ToString())
            .Prop("ValorBruto", me.ValorBruto.ToString())
            .Prop("ValorLiquido", me.ValorLiquido.ToString())
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

End Namespace