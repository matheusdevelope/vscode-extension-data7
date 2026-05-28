Imports mod_card_adm
Imports mod_card_schema
Imports mod_card_grouper
Imports mod_pipeline_controller

'@Module
Namespace mod_card_controller

   Class TCardController
      Inherits TPipelineController

      Private _inputAdm As CardAdm

      Sub New()
         MyBase.New()
      End Sub

      Overrides Function GetInputSchemaOptions() As String
         GetInputSchemaOptions = """" & CardAdm.GetOptions().Trim.Replace(";", """;""") & """"
      End Function

      Overrides Sub SetInputSchema(pSchema As String)
         MyBase.SetInputSchema(pSchema)
         Try
             me._inputAdm = CardAdm.Load(pSchema)
             me._pipe.Schema = CardSchema.Load(me._inputAdm)
             me._canExport = False
         Catch ex As Exception
             me._lastError = ex._GetMessage()
             Throw ex
         End Try
      End Sub

      Overrides Function GetGrouperOutputOptions() As String
         If me._pipe.Schema <> NULL
            If me._pipe.Schema.SupportedGroupers.Count > 0 Then
               GetGrouperOutputOptions = me._pipe.Schema.SupportedGroupers.AsOptions
               Exit Function
            End If
         End If
         GetGrouperOutputOptions = """" & CardGrouper.GetOptions(me._inputAdm).Trim.Replace(";", """;""") & """"
      End Function

      Overrides Sub SetOutputGrouper(pGrouper As String)
         Dim safeGrouper As String = pGrouper.Replace("""", "").Trim()

         If safeGrouper = "" Then
            If me._pipe.Grouper <> NULL Then
               me._pipe.Grouper.Free()
            End If
            me._pipe.Grouper = NULL

            If me._pipe.Groups <> NULL Then
               me._pipe.Groups.Free()
            End If
            me._pipe.Groups = NULL

            Exit Sub
         End If

         MyBase.SetOutputGrouper(safeGrouper)
         Try
             me._pipe.Grouper = CardGrouper.Load(me._inputAdm, safeGrouper)
         Catch ex As Exception
             me._lastError = ex._GetMessage()
             Throw ex
         End Try
      End Sub

   End Class

End Namespace