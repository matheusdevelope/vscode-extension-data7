
Imports mod_card_adm
Imports mod_pipeline_grouper
Imports mod_pipeline_field

'@Module
Namespace mod_card_grouper

   Class CardGrouper
      Inherits TGrouper

      ReadOnly Adm As CardAdm

      Sub New(pAdm As CardAdm, pName As String)
         MyBase.New("-", "CardGrouper-" + pAdm.AsString + "-" + pName)
         me.Adm = pAdm
      End Sub

      Shared Function GetOptions(pAdm As CardAdm) As String
         If pAdm = NULL Then Return ""
         Select pAdm
            Case CardAdm.Stone
               GetOptions = mod_card_stone.CardGroupersStone.GetOptions()
            ' Case CardAdm.Cielo
            '    GetOptions = mod_card_cielo.CardGroupersCielo.GetOptions()
            Case Else
               GetOptions = ""
         End Select
      End Function

      Shared Function Load(pAdm As CardAdm, pGrouperName As String) As CardGrouper
         If pAdm = NULL Then Throw New Exception("Invalid CardAdm")

         Select pAdm
            Case CardAdm.Stone
               Load = mod_card_stone.CardGroupersStone.LoadGrouper(pGrouperName, pAdm)
            ' Case CardAdm.Cielo
            '    Load = mod_card_cielo.CardGroupersCielo.LoadGrouper(pGrouperName, pAdm)
            Case Else
               Throw New Exception("Groupers not supported for ADM: " + pAdm.AsString)
         End Select
      End Function

      Sub Free()
         MyBase.Free()
      End Sub

   End Class

   ' === AGRUPADORES COMPARTILHADOS (REUTILIZÁVEIS) ===

   Class GrouperBandeiraProduto
      Inherits CardGrouper

      Sub New(pAdm As CardAdm)
         MyBase.New(pAdm, "BandeiraProduto")
         With me.Definition.Fields
            .Add(New TField("Bandeira"))
            .Add(New TField("Produto"))
         End With
      End Sub
   End Class

   Class GrouperDataPagamento
      Inherits CardGrouper

      Sub New(pAdm As CardAdm)
         MyBase.New(pAdm, "DataPagamento")
         With me.Definition.Fields
            .Add(New TField("DataPagamento"))
         End With
      End Sub
   End Class

End Namespace