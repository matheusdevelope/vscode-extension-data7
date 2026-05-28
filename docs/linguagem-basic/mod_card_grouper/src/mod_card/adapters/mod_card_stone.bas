
Imports mod_enum
Imports mod_card_adm
Imports mod_card_schema
Imports mod_card_grouper
Imports mod_pipeline_field
Imports mod_pipeline_datasource
Imports mod_pipeline_navigator

'@Module
Namespace mod_card_stone

   Class CardSchemaStone
      Inherits CardSchema

      Sub New()
         MyBase.New(CardAdm.Stone)

         With me
            .Estabelecimento.Options.Add("StoneCode")
            .NumeroCartao.Options.Add("N° Cartao")
            .NumeroCartao.Options.Add("N° Cartão")
            .NumeroAutorizacao.Options.Add("Stone ID")
            .NumeroParcela.Options.Add("Nº da Parcela")
            .QuantidadeParcela.Options.Add("Qtd de Parcelas")
            .DataVenda.Options.Add("Data da venda")
            .DataPagamento.Options.Add("Data do Último Status")
            .ValorBruto.Options.Add("Valor Bruto")
            .ValorLiquido.Options.Add("Valor Líquido")
            .Fields.Add(New TField("StatusTitulo", True))
            .Fields.Last.Options.Add("Último Status")
            .Fields.Add(New TField("Produto", True))
         End With

         me.SupportedInputDataSources.Add(DataSource.Excel)
         me.SupportedInputDataSources.Add(DataSource.CSV)

         me.SupportedInputNavigators.Add(Navigator.Horizontal)

         me.SupportedOutputDataSources.Add(DataSource.Excel)
         me.SupportedOutputDataSources.Add(DataSource.CSV)

         'me.SupportedOutputNavigators.Add(Navigator.Horizontal)
         me.SupportedGroupers.Add(CardGroupersStone.BandeiraProduto)

      End Sub

      Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Class CardGroupersStone
      Inherits BaseEnum

      Private Shared _Initialized As Boolean

      Private Sub New(pValue As Integer, pDescription As String)
         MyBase.New(pValue, pDescription)
      End Sub

      Private Shared Sub Initialize()
         If _Initialized Then Exit Sub
         BaseEnum._AddEnumItem("CardGroupersStone", New CardGroupersStone(0, "Por Bandeira e Produto"))
         BaseEnum._AddEnumItem("CardGroupersStone", New CardGroupersStone(1, "Por Data de Pagamento"))
         _Initialized = True
      End Sub

      Shared Function BandeiraProduto As CardGroupersStone
         BandeiraProduto = Load("Por Bandeira e Produto")
      End Function

      Shared Function DataPagamento As CardGroupersStone
         DataPagamento = Load("Por Data de Pagamento")
      End Function

      Shared Function Load(pValue As CardGroupersStone) As CardGroupersStone
         Load = Load(pValue.AsString)
      End Function

      Shared Function Load(pValue As Integer) As CardGroupersStone
         CardGroupersStone.Initialize()
         Load = CardGroupersStone(BaseEnum._GetCache("CardGroupersStone", pValue))
      End Function

      Shared Function Load(pValue As String) As CardGroupersStone
         CardGroupersStone.Initialize()
         Load = CardGroupersStone(BaseEnum._GetCache("CardGroupersStone", pValue))
      End Function

      Shared Function GetOptions() As String
         CardGroupersStone.Initialize()
         GetOptions = BaseEnum._GetEnumOptions("CardGroupersStone")
      End Function

      Shared Function LoadGrouper(pGrouperName As String, pAdm As CardAdm) As CardGrouper
         CardGroupersStone.Initialize()
         Select CardGroupersStone.Load(pGrouperName)
            Case CardGroupersStone.BandeiraProduto
               Return New GrouperBandeiraProduto(pAdm)
            Case CardGroupersStone.DataPagamento
               Return New GrouperDataPagamento(pAdm)
            Case Else
               Throw New Exception("Grouper não implementado na Stone.")
         End Select
      End Function

   End Class

End Namespace