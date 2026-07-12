' @example: diagnostics/missing-return-type/trigger
' @demonstrates: declaração de Function ou Property sem especificar tipo de retorno (As)
' @diagnostics: missing-return-type@7, missing-return-type@10

Namespace mod_missing_return
   Class C
      Property Prop()
      End Property

      Function Fun()
      End Function

      Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace
