Imports mod_tobject

Namespace mod_product

   Class Product
      Inherits TTObject

      Codigo As Integer
      Descricao As String

      Sub New(pCodigo As Integer, pDescricao As String)
         MyBase.New()
         me.Codigo = pCodigo
         me.Descricao = pDescricao
      End Sub

      Sub New(pValue As Product)
         MyBase.New()
         me.Assign(pValue)
      End Sub

      Sub Assign(pValue As Product)
         If Assigned(pValue) Then
            me.Codigo = pValue.Codigo
            me.Descricao = pValue.Descricao
         End If
      End Sub

      Overrides Function Clone() As Product
         Clone = New Product(me)
      End Function

      Overrides Function ToString() As String
         With me.BuildLogger(me.ClassName)
            .Prop("Codigo", me.Codigo)
            .Prop("Descricao", me.Descricao)
            ToString = .Text()
            .Free()
         End With
      End Function

      Sub Free()
         MyBase.Free()
      End Sub

   End Class


End Namespace